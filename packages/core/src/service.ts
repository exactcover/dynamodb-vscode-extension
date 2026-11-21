import {
  CreateTableCommand,
  DeleteItemCommand,
  UpdateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ExecuteStatementCommand,
  GetItemCommand,
  ListTablesCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  type AttributeValue,
  type DynamoDBClientConfig,
  type KeySchemaElement,
  type ProjectionType,
} from "@aws-sdk/client-dynamodb";
import { fromIni } from "@aws-sdk/credential-provider-ini";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import {
  assertAttributeName,
  assertTableName,
  buildContainsFilter,
  buildKeyCondition,
  clampLimit,
  coerceKeyInput,
  fromAttributeMap,
  toAttributeMap,
  toAttributeValue,
  type AttributeValueLike,
  type ClientConfig,
  type CreateIndexInput,
  type CreateTableInput,
  type DeleteItemInput,
  type GetItemInput,
  type ImportItemsInput,
  type ImportItemsResult,
  type IndexDescription,
  type ItemPage,
  type KeyAttributeType,
  type KeySchema,
  type PutItemInput,
  type QueryItemsInput,
  type ScanItemsInput,
  type SearchItemsInput,
  type StatementInput,
  type StatementResult,
  type TableDescription,
} from "@dynamodb-client/protocol";
import type { DynamoApi } from "./api";
import { errorMessage } from "./errors";

const DESCRIPTION_TTL_MS = 30_000;

export function createDynamoClient(config: ClientConfig): DynamoDBClient {
  const options: DynamoDBClientConfig = {
    region: config.region || "us-east-1",
    maxAttempts: 3,
  };
  if (config.endpoint) options.endpoint = config.endpoint;
  if (config.mode === "local" || config.mode === "keys") {
    options.credentials = {
      accessKeyId: config.accessKeyId || "local",
      secretAccessKey: config.secretAccessKey || "local",
      sessionToken: config.sessionToken,
    };
  } else if (config.mode === "profile") {
    options.credentials = fromIni({ profile: config.profile || "default" });
  } else {
    options.credentials = defaultProvider();
  }
  return new DynamoDBClient(options);
}

function asAws(value: AttributeValueLike): AttributeValue {
  return value as AttributeValue;
}

function asAwsMap(item: Record<string, unknown>): Record<string, AttributeValue> {
  const mapped = toAttributeMap(item);
  const out: Record<string, AttributeValue> = {};
  for (const [key, attribute] of Object.entries(mapped)) out[key] = asAws(attribute);
  return out;
}

function mapKeys(schema: KeySchemaElement[] | undefined, types: Map<string, KeyAttributeType>): KeySchema[] {
  return (schema ?? []).map((key) => {
    const name = key.AttributeName ?? "";
    const type = types.get(name);
    if (!name || !type || (key.KeyType !== "HASH" && key.KeyType !== "RANGE")) {
      throw new Error(`Table key schema is missing a type for "${name || "unknown"}".`);
    }
    return { name, type, role: key.KeyType };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DynamoService implements DynamoApi {
  private readonly client: DynamoDBClient;
  private readonly descriptions = new Map<string, { at: number; value: TableDescription }>();

  constructor(config: ClientConfig) {
    this.client = createDynamoClient(config);
  }

  close(): void {
    this.descriptions.clear();
    this.client.destroy();
  }

  async listTables(): Promise<string[]> {
    const names: string[] = [];
    let start: string | undefined;
    do {
      const out = await this.client.send(new ListTablesCommand({ ExclusiveStartTableName: start, Limit: 100 }));
      names.push(...(out.TableNames ?? []));
      start = out.LastEvaluatedTableName;
    } while (start);
    names.sort((a, b) => a.localeCompare(b));
    return names;
  }

  async describeTable(tableName: string, force = false): Promise<TableDescription> {
    const name = assertTableName(tableName);
    const cached = this.descriptions.get(name);
    if (!force && cached && Date.now() - cached.at < DESCRIPTION_TTL_MS) return cached.value;
    const out = await this.client.send(new DescribeTableCommand({ TableName: name }));
    if (!out.Table) throw new Error(`Table ${name} was not found.`);
    const table = out.Table;
    const types = new Map<string, KeyAttributeType>();
    for (const attr of table.AttributeDefinitions ?? []) {
      if (attr.AttributeName && (attr.AttributeType === "S" || attr.AttributeType === "N" || attr.AttributeType === "B")) {
        types.set(attr.AttributeName, attr.AttributeType);
      }
    }
    const indexes: IndexDescription[] = [];
    for (const gsi of table.GlobalSecondaryIndexes ?? []) {
      indexes.push({
        name: gsi.IndexName ?? "",
        type: "GSI",
        keys: mapKeys(gsi.KeySchema, types),
        projection: gsi.Projection?.ProjectionType as ProjectionType | undefined,
        status: gsi.IndexStatus,
      });
    }
    for (const lsi of table.LocalSecondaryIndexes ?? []) {
      indexes.push({
        name: lsi.IndexName ?? "",
        type: "LSI",
        keys: mapKeys(lsi.KeySchema, types),
        projection: lsi.Projection?.ProjectionType as ProjectionType | undefined,
      });
    }
    const described: TableDescription = {
      name: table.TableName ?? name,
      status: table.TableStatus,
      itemCount: table.ItemCount,
      sizeBytes: table.TableSizeBytes,
      billingMode: table.BillingModeSummary?.BillingMode ?? (table.ProvisionedThroughput ? "PROVISIONED" : undefined),
      keys: mapKeys(table.KeySchema, types),
      indexes,
      createdAt: table.CreationDateTime?.toISOString(),
    };
    this.descriptions.set(name, { at: Date.now(), value: described });
    return described;
  }

  async createTable(input: CreateTableInput): Promise<TableDescription> {
    const tableName = assertTableName(input.tableName);
    const partitionName = assertAttributeName(input.partitionKey.name, "Partition key");
    const partitionType = keyType(input.partitionKey.type);
    const definitions = [{ AttributeName: partitionName, AttributeType: partitionType }];
    const keySchema: { AttributeName: string; KeyType: "HASH" | "RANGE" }[] = [
      { AttributeName: partitionName, KeyType: "HASH" },
    ];
    if (input.sortKey) {
      const sortName = assertAttributeName(input.sortKey.name, "Sort key");
      if (sortName === partitionName) throw new Error("Partition key and sort key must be different attributes.");
      definitions.push({ AttributeName: sortName, AttributeType: keyType(input.sortKey.type) });
      keySchema.push({ AttributeName: sortName, KeyType: "RANGE" });
    }
    const localIndexes = input.localIndexes ?? [];
    if (localIndexes.length > 0 && !input.sortKey) {
      throw new Error("A local index needs a sort key on the table.");
    }
    if (localIndexes.length > 5) throw new Error("A table can have at most 5 local indexes.");
    const usedAttributes = new Set<string>([partitionName]);
    const tableSort = input.sortKey ? definitions[1]?.AttributeName : undefined;
    if (tableSort) usedAttributes.add(tableSort);
    const usedIndexNames = new Set<string>();
    const localSecondaryIndexes = localIndexes.map((index) => {
      const indexName = index.indexName.trim();
      if (!/^[A-Za-z0-9_.-]{3,255}$/.test(indexName)) {
        throw new Error("Index names are 3–255 characters: letters, numbers, underscore, hyphen, or dot.");
      }
      if (usedIndexNames.has(indexName)) throw new Error(`Index "${indexName}" is already used.`);
      usedIndexNames.add(indexName);
      const sortName = assertAttributeName(index.sortKey.name, "Local index sort key");
      const sortType = keyType(index.sortKey.type);
      if (usedAttributes.has(sortName)) throw new Error(`"${sortName}" is already a key.`);
      usedAttributes.add(sortName);
      const existing = definitions.find((item) => item.AttributeName === sortName);
      if (existing && existing.AttributeType !== sortType) {
        throw new Error(`"${sortName}" is already defined as ${typeLabel(existing.AttributeType)}.`);
      }
      if (!existing) definitions.push({ AttributeName: sortName, AttributeType: sortType });
      const projection = index.projection;
      if (projection !== "ALL" && projection !== "KEYS_ONLY" && projection !== "INCLUDE") {
        throw new Error("Projection must be all attributes, keys only, or include.");
      }
      const nonKey = projection === "INCLUDE"
        ? (index.nonKeyAttributes ?? []).map((name) => assertAttributeName(name, "Projected attribute"))
        : undefined;
      if (projection === "INCLUDE" && (!nonKey || nonKey.length === 0)) {
        throw new Error("Include projection needs at least one attribute name.");
      }
      return {
        IndexName: indexName,
        KeySchema: [
          { AttributeName: partitionName, KeyType: "HASH" as const },
          { AttributeName: sortName, KeyType: "RANGE" as const },
        ],
        Projection: projection === "INCLUDE"
          ? { ProjectionType: projection, NonKeyAttributes: nonKey }
          : { ProjectionType: projection },
      };
    });
    await this.client.send(
      new CreateTableCommand({
        TableName: tableName,
        AttributeDefinitions: definitions,
        KeySchema: keySchema,
        LocalSecondaryIndexes: localSecondaryIndexes.length > 0 ? localSecondaryIndexes : undefined,
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    const deadline = Date.now() + 15_000;
    let described: TableDescription | undefined;
    while (Date.now() < deadline) {
      try {
        described = await this.describeTable(tableName, true);
        if (described.status === "ACTIVE") return described;
      } catch {
        // The table can take a moment to show up.
      }
      await sleep(400);
    }
    if (described) return described;
    throw new Error("Table creation was accepted, but the table is not visible yet. Refresh in a moment.");
  }

  async createIndex(input: CreateIndexInput): Promise<TableDescription> {
    const tableName = assertTableName(input.tableName);
    const indexName = input.indexName.trim();
    if (!/^[A-Za-z0-9_.-]{3,255}$/.test(indexName)) {
      throw new Error("Index names are 3–255 characters: letters, numbers, underscore, hyphen, or dot.");
    }
    const current = await this.describeTable(tableName, true);
    if (current.indexes.some((index) => index.name === indexName)) {
      throw new Error(`Index "${indexName}" already exists.`);
    }
    if (current.indexes.some((index) => index.status === "CREATING")) {
      throw new Error("Wait until the index that is still creating becomes active.");
    }
    const projection = input.projection;
    if (projection !== "ALL" && projection !== "KEYS_ONLY" && projection !== "INCLUDE") {
      throw new Error("Projection must be all attributes, keys only, or include.");
    }
    const partitionName = assertAttributeName(input.partitionKey.name, "Partition key");
    const wanted = new Map<string, KeyAttributeType>([[partitionName, keyType(input.partitionKey.type)]]);
    const keySchema: { AttributeName: string; KeyType: "HASH" | "RANGE" }[] = [
      { AttributeName: partitionName, KeyType: "HASH" },
    ];
    if (input.sortKey) {
      const sortName = assertAttributeName(input.sortKey.name, "Sort key");
      if (sortName === partitionName) throw new Error("Partition key and sort key must be different attributes.");
      wanted.set(sortName, keyType(input.sortKey.type));
      keySchema.push({ AttributeName: sortName, KeyType: "RANGE" });
    }
    const existing = new Map<string, KeyAttributeType>();
    for (const key of current.keys) existing.set(key.name, key.type);
    for (const index of current.indexes) {
      for (const key of index.keys) existing.set(key.name, key.type);
    }
    const definitions: { AttributeName: string; AttributeType: KeyAttributeType }[] = [];
    for (const [name, type] of wanted) {
      const already = existing.get(name);
      if (already && already !== type) {
        throw new Error(`"${name}" is already defined as ${typeLabel(already)}.`);
      }
      if (!already) definitions.push({ AttributeName: name, AttributeType: type });
    }
    const nonKey = projection === "INCLUDE"
      ? (input.nonKeyAttributes ?? []).map((name) => assertAttributeName(name, "Projected attribute"))
      : undefined;
    if (projection === "INCLUDE" && (!nonKey || nonKey.length === 0)) {
      throw new Error("Include projection needs at least one attribute name.");
    }
    const provisioned = current.billingMode === "PROVISIONED";
    let throughput: { ReadCapacityUnits: number; WriteCapacityUnits: number } | undefined;
    if (provisioned) {
      const read = input.readCapacity;
      const write = input.writeCapacity;
      if (!read || !write || read < 1 || write < 1) {
        throw new Error("This table uses provisioned capacity. Enter read and write capacity for the index.");
      }
      throughput = { ReadCapacityUnits: Math.floor(read), WriteCapacityUnits: Math.floor(write) };
    }
    await this.client.send(
      new UpdateTableCommand({
        TableName: tableName,
        AttributeDefinitions: definitions.length > 0 ? definitions : undefined,
        GlobalSecondaryIndexUpdates: [
          {
            Create: {
              IndexName: indexName,
              KeySchema: keySchema,
              Projection: { ProjectionType: projection, NonKeyAttributes: nonKey },
              ProvisionedThroughput: throughput,
            },
          },
        ],
      }),
    );
    this.descriptions.delete(tableName);
    const deadline = Date.now() + 20_000;
    let described = await this.describeTable(tableName, true);
    while (Date.now() < deadline) {
      const created = described.indexes.find((index) => index.name === indexName);
      if (created && created.status !== "CREATING") return described;
      await sleep(500);
      described = await this.describeTable(tableName, true);
    }
    return described;
  }

  async deleteTable(tableName: string): Promise<void> {
    const name = assertTableName(tableName);
    await this.client.send(new DeleteTableCommand({ TableName: name }));
    this.descriptions.delete(name);
  }

  async getItem(input: GetItemInput): Promise<Record<string, unknown> | null> {
    const table = await this.describeTable(input.tableName);
    const out = await this.client.send(
      new GetItemCommand({
        TableName: table.name,
        Key: asAwsMap(keyFrom(input.key, table)),
        ConsistentRead: input.consistentRead,
      }),
    );
    return out.Item ? fromAttributeMap(out.Item) : null;
  }

  async putItem(input: PutItemInput): Promise<void> {
    if (!input.item || typeof input.item !== "object" || Array.isArray(input.item)) {
      throw new Error("Item must be a JSON object.");
    }
    const table = await this.describeTable(input.tableName);
    for (const key of table.keys) {
      const value = input.item[key.name];
      if (value === undefined || value === "") throw new Error(`Key attribute "${key.name}" is required.`);
    }
    const hash = table.keys.find((key) => key.role === "HASH");
    await this.client.send(
      new PutItemCommand({
        TableName: table.name,
        Item: asAwsMap(input.item),
        ConditionExpression: input.mode === "create" ? "attribute_not_exists(#pk)" : undefined,
        ExpressionAttributeNames: input.mode === "create" && hash ? { "#pk": hash.name } : undefined,
      }),
    );
  }

  async deleteItem(input: DeleteItemInput): Promise<void> {
    const table = await this.describeTable(input.tableName);
    await this.client.send(
      new DeleteItemCommand({
        TableName: table.name,
        Key: asAwsMap(keyFrom(input.key, table)),
      }),
    );
  }

  async importItems(input: ImportItemsInput): Promise<ImportItemsResult> {
    if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("Nothing to import.");
    if (input.items.length > 200) throw new Error("Import up to 200 items at a time.");
    let imported = 0;
    let failed = 0;
    const errors: { index: number; message: string }[] = [];
    for (let index = 0; index < input.items.length; index += 1) {
      const item = input.items[index];
      try {
        if (!item) throw new Error("Item is empty.");
        await this.putItem({ tableName: input.tableName, item, mode: input.mode });
        imported += 1;
      } catch (err) {
        failed += 1;
        if (errors.length < 20) errors.push({ index, message: errorMessage(err) });
      }
    }
    return { imported, failed, errors };
  }

  async scan(input: ScanItemsInput): Promise<ItemPage> {
    const table = await this.describeTable(input.tableName);
    const index = this.resolveIndex(table, input.indexName);
    if (input.consistentRead && index?.type === "GSI") {
      throw new Error("Global secondary indexes do not support consistent reads.");
    }
    const target = clampLimit(input.limit);
    const filtered = Boolean(input.filterExpression);
    const items: Record<string, unknown>[] = [];
    let scanned = 0;
    let capacity = 0;
    let start = input.exclusiveStartKey ? asAwsMap(input.exclusiveStartKey) : undefined;
    let lastKey: Record<string, unknown> | undefined;
    const maxRounds = filtered ? 25 : 1;
    for (let round = 0; round < maxRounds && items.length < target; round += 1) {
      const out = await this.client.send(
        new ScanCommand({
          TableName: table.name,
          IndexName: index?.name,
          Limit: filtered ? 100 : target,
          ExclusiveStartKey: start,
          FilterExpression: input.filterExpression,
          ExpressionAttributeNames: input.names,
          ExpressionAttributeValues: input.values ? asAwsMap(input.values) : undefined,
          ConsistentRead: index?.type === "GSI" ? undefined : input.consistentRead,
          ReturnConsumedCapacity: "TOTAL",
        }),
      );
      for (const item of out.Items ?? []) items.push(fromAttributeMap(item));
      scanned += out.ScannedCount ?? 0;
      capacity += out.ConsumedCapacity?.CapacityUnits ?? 0;
      lastKey = out.LastEvaluatedKey ? fromAttributeMap(out.LastEvaluatedKey, "preserve") : undefined;
      if (!out.LastEvaluatedKey) {
        lastKey = undefined;
        break;
      }
      start = out.LastEvaluatedKey;
    }
    return { items, lastEvaluatedKey: lastKey, scannedCount: scanned, count: items.length, capacityUnits: capacity };
  }

  async query(input: QueryItemsInput): Promise<ItemPage> {
    const table = await this.describeTable(input.tableName);
    const index = this.resolveIndex(table, input.indexName);
    const keys = index?.keys ?? table.keys;
    const partition = keys.find((key) => key.role === "HASH");
    const sort = keys.find((key) => key.role === "RANGE");
    if (!partition) throw new Error("This table has no partition key.");
    if (input.consistentRead && index?.type === "GSI") {
      throw new Error("Global secondary indexes do not support consistent reads.");
    }
    if (input.sortKeyOperator === "begins_with" && sort && sort.type !== "S") {
      throw new Error("begins_with is only valid for string sort keys.");
    }
    const built = buildKeyCondition({
      partitionKeyName: partition.name,
      partitionKeyValue: coerceMaybe(input.partitionKeyValue, partition.type),
      sortKeyName: sort?.name,
      sortKeyOperator: input.sortKeyOperator,
      sortKeyValue: sort && input.sortKeyValue !== undefined ? coerceMaybe(input.sortKeyValue, sort.type) : undefined,
      sortKeyValue2: sort && input.sortKeyValue2 !== undefined ? coerceMaybe(input.sortKeyValue2, sort.type) : undefined,
    });
    const out = await this.client.send(
      new QueryCommand({
        TableName: table.name,
        IndexName: index?.name,
        KeyConditionExpression: built.expression,
        ExpressionAttributeNames: built.names,
        ExpressionAttributeValues: asAwsMap(built.values),
        ExclusiveStartKey: input.exclusiveStartKey ? asAwsMap(input.exclusiveStartKey) : undefined,
        Limit: clampLimit(input.limit),
        ConsistentRead: index?.type === "GSI" ? undefined : input.consistentRead,
        ScanIndexForward: input.scanIndexForward,
        ReturnConsumedCapacity: "TOTAL",
      }),
    );
    return {
      items: (out.Items ?? []).map((item) => fromAttributeMap(item)),
      lastEvaluatedKey: out.LastEvaluatedKey ? fromAttributeMap(out.LastEvaluatedKey, "preserve") : undefined,
      scannedCount: out.ScannedCount ?? 0,
      count: out.Count ?? out.Items?.length ?? 0,
      capacityUnits: out.ConsumedCapacity?.CapacityUnits,
    };
  }

  async search(input: SearchItemsInput): Promise<ItemPage> {
    const text = input.text.trim();
    if (!text) throw new Error("Enter text to search.");
    const table = await this.describeTable(input.tableName);
    let attributes: string[];
    if (input.attribute?.trim()) {
      attributes = [assertAttributeName(input.attribute, "Search attribute")];
    } else {
      const keyNames = table.keys.filter((key) => key.type === "S").map((key) => key.name);
      const sampled = await this.sampleStringAttributes(table.name);
      attributes = [...new Set([...keyNames, ...sampled])].slice(0, 8);
    }
    if (attributes.length === 0) {
      throw new Error("No string attributes to search. Type an attribute name, or use PartiQL for nested fields.");
    }
    const filter = buildContainsFilter(attributes, text);
    return this.scan({
      tableName: table.name,
      limit: input.limit,
      exclusiveStartKey: input.exclusiveStartKey,
      consistentRead: input.consistentRead,
      filterExpression: filter.expression,
      names: filter.names,
      values: filter.values,
    });
  }

  async executeStatement(input: StatementInput): Promise<StatementResult> {
    const statement = input.statement.trim();
    if (!statement) throw new Error("Enter a PartiQL statement.");
    const isSelect = /^\s*select\b/i.test(statement);
    const out = await this.client.send(
      new ExecuteStatementCommand({
        Statement: statement,
        Parameters: (input.parameters ?? []).map((value) => asAws(toAttributeValue(value))),
        NextToken: input.nextToken,
        Limit: isSelect ? clampLimit(input.limit, 100) : undefined,
        ReturnConsumedCapacity: "TOTAL",
      }),
    );
    return {
      items: (out.Items ?? []).map((item) => fromAttributeMap(item)),
      nextToken: out.NextToken,
      capacityUnits: out.ConsumedCapacity?.CapacityUnits,
    };
  }

  private resolveIndex(table: TableDescription, indexName?: string): IndexDescription | undefined {
    if (!indexName) return undefined;
    const index = table.indexes.find((item) => item.name === indexName);
    if (!index) throw new Error(`Index "${indexName}" was not found on ${table.name}.`);
    return index;
  }

  private async sampleStringAttributes(tableName: string): Promise<string[]> {
    const out = await this.client.send(new ScanCommand({ TableName: tableName, Limit: 20 }));
    const found = new Set<string>();
    for (const item of out.Items ?? []) {
      for (const [name, value] of Object.entries(item)) {
        if (value.S !== undefined || value.SS !== undefined) found.add(name);
      }
    }
    return [...found].toSorted();
  }
}

function typeLabel(type: KeyAttributeType): string {
  if (type === "S") return "String";
  if (type === "N") return "Number";
  return "Binary";
}

function keyType(type: string): KeyAttributeType {
  if (type === "S" || type === "N" || type === "B") return type;
  throw new Error("Key type must be S, N, or B.");
}

function keyFrom(key: Record<string, unknown>, table: TableDescription): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const part of table.keys) {
    if (!(part.name in key)) throw new Error(`Key attribute "${part.name}" is required.`);
    out[part.name] = coerceMaybe(key[part.name], part.type);
  }
  return out;
}

function coerceMaybe(value: unknown, type: KeyAttributeType): unknown {
  if (typeof value === "string") return coerceKeyInput(value, type);
  if (value === undefined || value === null || value === "") throw new Error("Key value is required.");
  return value;
}
