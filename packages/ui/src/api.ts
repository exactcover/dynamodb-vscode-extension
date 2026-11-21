import type {
  ConnectionInput,
  CreateTableInput,
  ImportItemsResult,
  ItemPage,
  PublicConnection,
  QueryItemsInput,
  ScanItemsInput,
  SearchItemsInput,
  StatementResult,
  TableDescription,
} from "@dynamodb-client/protocol";
import type { Transport } from "./host";

export interface AppInfo {
  encryption: boolean;
  platform: string;
  product: "vscode" | "desktop";
}

export function createApi(transport: Transport) {
  const call = <T>(method: string, params?: unknown) => transport.request<T>(method, params ?? {});
  return {
    listConnections: () => call<PublicConnection[]>("connections.list"),
    saveConnection: (input: ConnectionInput) => call<PublicConnection>("connections.save", input),
    deleteConnection: (id: string) => call<{ ok: boolean }>("connections.delete", { id }),
    testConnection: (input: ConnectionInput) => call<{ tableCount: number }>("connections.test", input),
    listTables: (connectionId: string) => call<string[]>("tables.list", { connectionId }),
    describeTable: (connectionId: string, tableName: string, force = false) =>
      call<TableDescription>("tables.describe", { connectionId, tableName, force }),
    createTable: (connectionId: string, input: CreateTableInput) =>
      call<TableDescription>("tables.create", { connectionId, ...input }),
    deleteTable: (connectionId: string, tableName: string) => call<{ ok: boolean }>("tables.delete", { connectionId, tableName }),
    scan: (params: { connectionId: string } & ScanItemsInput) => call<ItemPage>("items.scan", params),
    query: (params: { connectionId: string } & QueryItemsInput) => call<ItemPage>("items.query", params),
    search: (params: { connectionId: string } & SearchItemsInput) => call<ItemPage>("items.search", params),
    putItem: (connectionId: string, tableName: string, item: Record<string, unknown>, mode: "create" | "replace") =>
      call<{ ok: boolean }>("items.put", { connectionId, tableName, item, mode }),
    deleteItem: (connectionId: string, tableName: string, key: Record<string, unknown>) =>
      call<{ ok: boolean }>("items.delete", { connectionId, tableName, key }),
    importItems: (connectionId: string, tableName: string, items: unknown[], mode: "create" | "replace") =>
      call<ImportItemsResult>("items.import", { connectionId, tableName, items, mode }),
    execute: (connectionId: string, statement: string, parameters: unknown[] | undefined, nextToken?: string) =>
      call<StatementResult>("partiql.execute", { connectionId, statement, parameters, nextToken, limit: 100 }),
    profiles: () => call<string[]>("aws.profiles"),
    info: () => call<AppInfo>("app.info"),
    saveJson: (suggestedName: string, contents: string) => call<{ saved: boolean }>("files.saveJson", { suggestedName, contents }),
    pickJson: () => call<{ contents: string | null }>("files.pickJson"),
    copy: (text: string) => call<{ ok: boolean }>("clipboard.write", { text }),
  };
}

export type Api = ReturnType<typeof createApi>;
