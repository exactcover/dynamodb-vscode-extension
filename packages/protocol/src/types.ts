export type KeyAttributeType = "S" | "N" | "B";

export type ConnectionMode = "local" | "profile" | "keys" | "default";

export type SortOperator = "eq" | "lt" | "lte" | "gt" | "gte" | "begins_with" | "between";

export interface ConnectionInput {
  id?: string;
  name: string;
  region: string;
  mode: ConnectionMode;
  endpoint?: string;
  profile?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** null clears a saved session token. Omit or pass "" to keep the saved token. */
  sessionToken?: string | null;
}

export interface PublicConnection {
  id: string;
  name: string;
  region: string;
  mode: ConnectionMode;
  endpoint?: string;
  profile?: string;
  accessKeyId?: string;
  hasSecret: boolean;
  hasSessionToken: boolean;
}

export interface SecretMaterial {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export interface ClientConfig {
  id: string;
  region: string;
  mode: ConnectionMode;
  endpoint?: string;
  profile?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export interface KeySchema {
  name: string;
  type: KeyAttributeType;
  role: "HASH" | "RANGE";
}

export interface IndexDescription {
  name: string;
  type: "GSI" | "LSI";
  keys: KeySchema[];
  projection?: "ALL" | "KEYS_ONLY" | "INCLUDE";
  status?: string;
}

export interface TableDescription {
  name: string;
  status?: string;
  itemCount?: number;
  sizeBytes?: number;
  billingMode?: string;
  keys: KeySchema[];
  indexes: IndexDescription[];
  createdAt?: string;
}

export interface ItemPage {
  items: Record<string, unknown>[];
  lastEvaluatedKey?: Record<string, unknown>;
  scannedCount: number;
  count: number;
  capacityUnits?: number;
}

export interface ScanItemsInput {
  tableName: string;
  indexName?: string;
  limit?: number;
  exclusiveStartKey?: Record<string, unknown>;
  consistentRead?: boolean;
  filterExpression?: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
}

export interface QueryItemsInput {
  tableName: string;
  indexName?: string;
  partitionKeyValue: unknown;
  sortKeyOperator?: SortOperator;
  sortKeyValue?: unknown;
  sortKeyValue2?: unknown;
  limit?: number;
  exclusiveStartKey?: Record<string, unknown>;
  consistentRead?: boolean;
  scanIndexForward?: boolean;
}

export interface SearchItemsInput {
  tableName: string;
  text: string;
  attribute?: string;
  limit?: number;
  exclusiveStartKey?: Record<string, unknown>;
  consistentRead?: boolean;
}

export interface GetItemInput {
  tableName: string;
  key: Record<string, unknown>;
  consistentRead?: boolean;
}

export interface PutItemInput {
  tableName: string;
  item: Record<string, unknown>;
  mode: "create" | "replace";
}

export interface DeleteItemInput {
  tableName: string;
  key: Record<string, unknown>;
}

export interface LocalIndexInput {
  indexName: string;
  sortKey: { name: string; type: KeyAttributeType };
  projection: "ALL" | "KEYS_ONLY" | "INCLUDE";
  nonKeyAttributes?: string[];
}

export interface GlobalIndexInput {
  indexName: string;
  partitionKey: { name: string; type: KeyAttributeType };
  sortKey?: { name: string; type: KeyAttributeType };
  projection: "ALL" | "KEYS_ONLY" | "INCLUDE";
  nonKeyAttributes?: string[];
}

export interface CreateTableInput {
  tableName: string;
  partitionKey: { name: string; type: KeyAttributeType };
  sortKey?: { name: string; type: KeyAttributeType };
  localIndexes?: LocalIndexInput[];
  globalIndexes?: GlobalIndexInput[];
}

export interface CreateIndexInput {
  tableName: string;
  indexName: string;
  partitionKey: { name: string; type: KeyAttributeType };
  sortKey?: { name: string; type: KeyAttributeType };
  projection: "ALL" | "KEYS_ONLY" | "INCLUDE";
  nonKeyAttributes?: string[];
  readCapacity?: number;
  writeCapacity?: number;
}

export interface ImportItemsInput {
  tableName: string;
  items: Record<string, unknown>[];
  mode: "create" | "replace";
}

export interface ImportItemsResult {
  imported: number;
  failed: number;
  errors: { index: number; message: string }[];
}

export interface StatementInput {
  statement: string;
  parameters?: unknown[];
  nextToken?: string;
  limit?: number;
}

export interface StatementResult {
  items: Record<string, unknown>[];
  nextToken?: string;
  capacityUnits?: number;
}

export interface BuiltExpression {
  expression: string;
  names: Record<string, string>;
  values: Record<string, unknown>;
}
