import type { ConnectionRepository } from "@dynamodb-client/core";
import type { PublicConnection, SecretMaterial } from "@dynamodb-client/protocol";
import * as vscode from "vscode";

const STATE_KEY = "dynamodb.connections";

function secretKey(id: string): string {
  return `dynamodb.connection.${id}`;
}

export class VsCodeConnectionRepository implements ConnectionRepository {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async load(): Promise<{ records: PublicConnection[]; secrets: Record<string, SecretMaterial> }> {
    const records = this.context.globalState.get<PublicConnection[]>(STATE_KEY) ?? [];
    const secrets: Record<string, SecretMaterial> = {};
    for (const record of records) {
      const raw = await this.context.secrets.get(secretKey(record.id));
      secrets[record.id] = parseSecret(raw);
    }
    return { records, secrets };
  }

  async persist(records: PublicConnection[], secrets: Record<string, SecretMaterial>): Promise<void> {
    const previous = this.context.globalState.get<PublicConnection[]>(STATE_KEY) ?? [];
    const nextIds = new Set(records.map((record) => record.id));
    for (const old of previous) {
      if (!nextIds.has(old.id)) await this.context.secrets.delete(secretKey(old.id));
    }
    for (const record of records) {
      await this.context.secrets.store(secretKey(record.id), JSON.stringify(secrets[record.id] ?? {}));
    }
    await this.context.globalState.update(STATE_KEY, records);
  }
}

function parseSecret(raw: string | undefined): SecretMaterial {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as SecretMaterial;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
