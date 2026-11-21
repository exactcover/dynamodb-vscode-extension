import { describe, expect, it } from "vitest";
import type { ClientConfig, TableDescription } from "@dynamodb-client/protocol";
import type { DynamoApi } from "./api";
import { ConnectionBook, type ConnectionRepository } from "./connections";
import { createDispatcher, type ServiceFactory } from "./dispatch";
import type { Host } from "./host";

function memoryRepo(): ConnectionRepository & { secrets: Record<string, { secretAccessKey?: string }> } {
  let records: Awaited<ReturnType<ConnectionRepository["load"]>>["records"] = [];
  const secrets: Awaited<ReturnType<ConnectionRepository["load"]>>["secrets"] = {};
  return {
    secrets,
    async load() {
      return { records: records.map((record) => ({ ...record })), secrets: { ...secrets } };
    },
    async persist(nextRecords, nextSecrets) {
      records = nextRecords;
      for (const key of Object.keys(secrets)) delete secrets[key];
      Object.assign(secrets, nextSecrets);
    },
  };
}

function stubService(tables: string[]): DynamoApi {
  const description: TableDescription = {
    name: "Users",
    status: "ACTIVE",
    keys: [{ name: "pk", type: "S", role: "HASH" }],
    indexes: [],
    billingMode: "PAY_PER_REQUEST",
  };
  return {
    listTables: async () => tables,
    describeTable: async () => description,
    createTable: async () => description,
    createIndex: async () => description,
    deleteTable: async () => undefined,
    getItem: async () => ({ pk: "a" }),
    putItem: async () => undefined,
    deleteItem: async () => undefined,
    importItems: async () => ({ imported: 1, failed: 0, errors: [] }),
    scan: async () => ({ items: [{ pk: "a", name: "Ada" }], scannedCount: 1, count: 1 }),
    query: async () => ({ items: [], scannedCount: 0, count: 0 }),
    search: async () => ({ items: [{ pk: "a" }], scannedCount: 4, count: 1 }),
    executeStatement: async () => ({ items: [] }),
    close: () => undefined,
  };
}

function hostFor(repo: ConnectionRepository): Host {
  return {
    connections: new ConnectionBook(repo),
    appInfo: async () => ({ encryption: true, platform: "test", product: "desktop" }),
    saveJsonFile: async () => true,
    pickJsonFile: async () => null,
    writeClipboard: async () => undefined,
  };
}

describe("dispatcher", () => {
  it("saves, lists, and deletes a connection without returning the secret", async () => {
    const repo = memoryRepo();
    const seen: ClientConfig[] = [];
    const services: ServiceFactory = {
      get(config) {
        seen.push(config);
        return stubService(["Users"]);
      },
      ephemeral(config) {
        seen.push(config);
        return stubService(["Users", "Orders"]);
      },
    };
    const dispatch = createDispatcher(hostFor(repo), services);
    const saved = await dispatch("connections.save", {
      name: "Local",
      region: "us-east-1",
      mode: "local",
      endpoint: "http://localhost:8000",
    });
    expect(saved).toMatchObject({ name: "Local", mode: "local", endpoint: "http://localhost:8000" });
    expect(JSON.stringify(saved)).not.toContain("secretAccessKey");
    const listed = (await dispatch("connections.list", {})) as { id: string }[];
    expect(listed).toHaveLength(1);
    const id = listed[0]?.id ?? "";
    const test = await dispatch("connections.test", {
      id,
      name: "Local",
      region: "us-east-1",
      mode: "local",
      endpoint: "http://localhost:8000",
    });
    expect(test).toEqual({ tableCount: 2 });
    const tables = await dispatch("tables.list", { connectionId: id });
    expect(tables).toEqual(["Users"]);
    expect(seen.some((config) => config.secretAccessKey === "local")).toBe(true);
    await dispatch("connections.delete", { id });
    await expect(dispatch("tables.list", { connectionId: id })).rejects.toThrow(/not found/);
  });

  it("keeps a saved access key secret when the form leaves it blank", async () => {
    const repo = memoryRepo();
    const dispatch = createDispatcher(hostFor(repo), {
      get: () => stubService([]),
      ephemeral: () => stubService([]),
    });
    const saved = (await dispatch("connections.save", {
      name: "Work",
      region: "us-west-2",
      mode: "keys",
      accessKeyId: "AKIA_TEST",
      secretAccessKey: "super-secret",
    })) as { id: string };
    await dispatch("connections.save", {
      id: saved.id,
      name: "Work renamed",
      region: "us-west-2",
      mode: "keys",
      accessKeyId: "AKIA_TEST",
      secretAccessKey: "",
    });
    const config = await new ConnectionBook(repo).configFor(saved.id);
    expect(config.secretAccessKey).toBe("super-secret");
    expect(config.region).toBe("us-west-2");
  });

  it("rejects an unknown request", async () => {
    const dispatch = createDispatcher(hostFor(memoryRepo()), {
      get: () => stubService([]),
      ephemeral: () => stubService([]),
    });
    await expect(dispatch("nope", {})).rejects.toThrow(/Unknown request/);
  });
});
