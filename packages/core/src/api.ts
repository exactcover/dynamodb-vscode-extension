import type {
  CreateIndexInput,
  CreateTableInput,
  DeleteItemInput,
  GetItemInput,
  ImportItemsInput,
  ImportItemsResult,
  ItemPage,
  PutItemInput,
  QueryItemsInput,
  ScanItemsInput,
  SearchItemsInput,
  StatementInput,
  StatementResult,
  TableDescription,
} from "@dynamodb-client/protocol";

export interface DynamoApi {
  listTables(): Promise<string[]>;
  describeTable(tableName: string, force?: boolean): Promise<TableDescription>;
  createTable(input: CreateTableInput): Promise<TableDescription>;
  createIndex(input: CreateIndexInput): Promise<TableDescription>;
  deleteTable(tableName: string): Promise<void>;
  getItem(input: GetItemInput): Promise<Record<string, unknown> | null>;
  putItem(input: PutItemInput): Promise<void>;
  deleteItem(input: DeleteItemInput): Promise<void>;
  importItems(input: ImportItemsInput): Promise<ImportItemsResult>;
  scan(input: ScanItemsInput): Promise<ItemPage>;
  query(input: QueryItemsInput): Promise<ItemPage>;
  search(input: SearchItemsInput): Promise<ItemPage>;
  executeStatement(input: StatementInput): Promise<StatementResult>;
  close(): void;
}
