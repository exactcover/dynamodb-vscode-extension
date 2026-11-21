import { normalizeImportedItems, type ConnectionInput, type ConnectionMode } from "@dynamodb-client/protocol";
import type { ClientConfig } from "@dynamodb-client/protocol";
import type { DynamoApi } from "./api";
import { errorMessage } from "./errors";
import type { Host } from "./host";
import { listAwsProfiles } from "./profiles";

const FILE_LIMIT = 5_000_000;
const MODES = new Set<ConnectionMode>(["local", "profile", "keys", "default"]);

const SORT_OPERATORS = new Set(["eq", "lt", "lte", "gt", "gte", "begins_with", "between"]);

export interface ServiceFactory {
  get(config: ClientConfig): DynamoApi;
  ephemeral(config: ClientConfig): DynamoApi;
}

function asObject(params: unknown): Record<string, unknown> {
  if (!params || typeof params !== "object" || Array.isArray(params)) throw new Error("Invalid request.");
  return params as Record<string, unknown>;
}

function reqString(obj: Record<string, unknown>, field: string): string {
  const value = obj[field];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

function optString(obj: Record<string, unknown>, field: string): string | undefined {
  const value = obj[field];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string.`);
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optBoolean(obj: Record<string, unknown>, field: string): boolean | undefined {
  const value = obj[field];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean.`);
  return value;
}

function optRecord(obj: Record<string, unknown>, field: string): Record<string, unknown> | undefined {
  const value = obj[field];
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value as Record<string, unknown>;
}

function connectionInput(params: unknown): ConnectionInput {
  const obj = asObject(params);
  const mode = reqString(obj, "mode");
  if (!MODES.has(mode as ConnectionMode)) throw new Error("Unknown connection mode.");
  return {
    id: optString(obj, "id"),
    name: typeof obj.name === "string" ? obj.name : "",
    region: typeof obj.region === "string" ? obj.region : "",
    mode: mode as ConnectionMode,
    endpoint: optString(obj, "endpoint"),
    profile: optString(obj, "profile"),
    accessKeyId: optString(obj, "accessKeyId"),
    secretAccessKey: typeof obj.secretAccessKey === "string" ? obj.secretAccessKey : undefined,
    sessionToken: obj.sessionToken === null ? null : typeof obj.sessionToken === "string" ? obj.sessionToken : undefined,
  };
}

function pageFields(obj: Record<string, unknown>) {
  return {
    limit: typeof obj.limit === "number" ? obj.limit : undefined,
    exclusiveStartKey: optRecord(obj, "exclusiveStartKey"),
    consistentRead: optBoolean(obj, "consistentRead"),
  };
}

export function createDispatcher(host: Host, services: ServiceFactory): (method: string, params: unknown) => Promise<unknown> {
  async function client(connectionId: string): Promise<DynamoApi> {
    return services.get(await host.connections.configFor(connectionId));
  }

  return async function dispatch(method: string, params: unknown): Promise<unknown> {
    try {
      switch (method) {
        case "connections.list":
          return host.connections.list();
        case "connections.save":
          return host.connections.save(connectionInput(params));
        case "connections.delete":
          await host.connections.delete(reqString(asObject(params), "id"));
          return { ok: true };
        case "connections.test": {
          const config = await host.connections.preview(connectionInput(params));
          const service = services.ephemeral(config);
          try {
            const tables = await service.listTables();
            return { tableCount: tables.length };
          } finally {
            service.close();
          }
        }
        case "tables.list":
          return (await client(reqString(asObject(params), "connectionId"))).listTables();
        case "tables.describe": {
          const obj = asObject(params);
          return (await client(reqString(obj, "connectionId"))).describeTable(reqString(obj, "tableName"), optBoolean(obj, "force"));
        }
        case "tables.create": {
          const obj = asObject(params);
          const partitionKey = asObject(obj.partitionKey);
          const sort = obj.sortKey ? asObject(obj.sortKey) : undefined;
          return (await client(reqString(obj, "connectionId"))).createTable({
            tableName: reqString(obj, "tableName"),
            partitionKey: { name: reqString(partitionKey, "name"), type: reqString(partitionKey, "type") as "S" | "N" | "B" },
            sortKey: sort
              ? { name: reqString(sort, "name"), type: reqString(sort, "type") as "S" | "N" | "B" }
              : undefined,
          });
        }
        case "tables.createIndex": {
          const obj = asObject(params);
          const partitionKey = asObject(obj.partitionKey);
          const sort = obj.sortKey ? asObject(obj.sortKey) : undefined;
          const nonKey = obj.nonKeyAttributes;
          return (await client(reqString(obj, "connectionId"))).createIndex({
            tableName: reqString(obj, "tableName"),
            indexName: reqString(obj, "indexName"),
            partitionKey: { name: reqString(partitionKey, "name"), type: reqString(partitionKey, "type") as "S" | "N" | "B" },
            sortKey: sort
              ? { name: reqString(sort, "name"), type: reqString(sort, "type") as "S" | "N" | "B" }
              : undefined,
            projection: reqString(obj, "projection") as "ALL" | "KEYS_ONLY" | "INCLUDE",
            nonKeyAttributes: Array.isArray(nonKey) ? nonKey.filter((item): item is string => typeof item === "string") : undefined,
            readCapacity: typeof obj.readCapacity === "number" ? obj.readCapacity : undefined,
            writeCapacity: typeof obj.writeCapacity === "number" ? obj.writeCapacity : undefined,
          });
        }
        case "tables.delete": {
          const obj = asObject(params);
          await (await client(reqString(obj, "connectionId"))).deleteTable(reqString(obj, "tableName"));
          return { ok: true };
        }
        case "items.get": {
          const obj = asObject(params);
          return (await client(reqString(obj, "connectionId"))).getItem({
            tableName: reqString(obj, "tableName"),
            key: optRecord(obj, "key") ?? {},
            consistentRead: optBoolean(obj, "consistentRead"),
          });
        }
        case "items.put": {
          const obj = asObject(params);
          const mode = reqString(obj, "mode");
          if (mode !== "create" && mode !== "replace") throw new Error("mode must be create or replace.");
          await (await client(reqString(obj, "connectionId"))).putItem({
            tableName: reqString(obj, "tableName"),
            item: optRecord(obj, "item") ?? {},
            mode,
          });
          return { ok: true };
        }
        case "items.delete": {
          const obj = asObject(params);
          await (await client(reqString(obj, "connectionId"))).deleteItem({
            tableName: reqString(obj, "tableName"),
            key: optRecord(obj, "key") ?? {},
          });
          return { ok: true };
        }
        case "items.import": {
          const obj = asObject(params);
          const mode = reqString(obj, "mode");
          if (mode !== "create" && mode !== "replace") throw new Error("mode must be create or replace.");
          if (!Array.isArray(obj.items)) throw new Error("items must be an array.");
          return (await client(reqString(obj, "connectionId"))).importItems({
            tableName: reqString(obj, "tableName"),
            items: normalizeImportedItems(obj.items),
            mode,
          });
        }
        case "items.scan": {
          const obj = asObject(params);
          return (await client(reqString(obj, "connectionId"))).scan({
            tableName: reqString(obj, "tableName"),
            indexName: optString(obj, "indexName"),
            ...pageFields(obj),
          });
        }
        case "items.query": {
          const obj = asObject(params);
          const operator = optString(obj, "sortKeyOperator");
          if (operator && !SORT_OPERATORS.has(operator)) throw new Error("Unknown sort key operator.");
          return (await client(reqString(obj, "connectionId"))).query({
            tableName: reqString(obj, "tableName"),
            indexName: optString(obj, "indexName"),
            partitionKeyValue: obj.partitionKeyValue,
            sortKeyOperator: operator as "eq" | undefined,
            sortKeyValue: obj.sortKeyValue,
            sortKeyValue2: obj.sortKeyValue2,
            scanIndexForward: optBoolean(obj, "scanIndexForward"),
            ...pageFields(obj),
          });
        }
        case "items.search": {
          const obj = asObject(params);
          return (await client(reqString(obj, "connectionId"))).search({
            tableName: reqString(obj, "tableName"),
            text: typeof obj.text === "string" ? obj.text : "",
            attribute: optString(obj, "attribute"),
            ...pageFields(obj),
          });
        }
        case "partiql.execute": {
          const obj = asObject(params);
          if (obj.parameters !== undefined && !Array.isArray(obj.parameters)) throw new Error("parameters must be a JSON array.");
          return (await client(reqString(obj, "connectionId"))).executeStatement({
            statement: typeof obj.statement === "string" ? obj.statement : "",
            parameters: obj.parameters as unknown[] | undefined,
            nextToken: optString(obj, "nextToken"),
            limit: typeof obj.limit === "number" ? obj.limit : undefined,
          });
        }
        case "aws.profiles":
          return listAwsProfiles();
        case "app.info":
          return host.appInfo();
        case "files.saveJson": {
          const obj = asObject(params);
          const contents = typeof obj.contents === "string" ? obj.contents : "";
          if (contents.length > FILE_LIMIT) throw new Error("Export is larger than 5 MB. Export fewer rows.");
          const saved = await host.saveJsonFile(reqString(obj, "suggestedName"), contents);
          return { saved };
        }
        case "files.pickJson": {
          const text = await host.pickJsonFile();
          if (text && text.length > FILE_LIMIT) throw new Error("That file is larger than 5 MB.");
          return { contents: text };
        }
        case "clipboard.write": {
          const obj = asObject(params);
          const text = typeof obj.text === "string" ? obj.text : "";
          if (text.length > FILE_LIMIT) throw new Error("That item is too large to copy.");
          await host.writeClipboard(text);
          return { ok: true };
        }
        default:
          throw new Error(`Unknown request "${method}".`);
      }
    } catch (err) {
      throw new Error(errorMessage(err), { cause: err });
    }
  };
}

export type Dispatcher = ReturnType<typeof createDispatcher>;
