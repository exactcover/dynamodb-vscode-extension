import type { ConnectionRepository } from "@dynamodb-client/core";
import type { PublicConnection, SecretMaterial } from "@dynamodb-client/protocol";
import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

interface FileShape {
  records: PublicConnection[];
  secrets: Record<string, string>;
}

export class ElectronConnectionRepository implements ConnectionRepository {
  private file(): string {
    return path.join(app.getPath("userData"), "connections.json");
  }

  async load(): Promise<{ records: PublicConnection[]; secrets: Record<string, SecretMaterial> }> {
    const file = this.file();
    if (!fs.existsSync(file)) return { records: [], secrets: {} };
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as FileShape;
    const secrets: Record<string, SecretMaterial> = {};
    let rotated = false;
    for (const [id, sealed] of Object.entries(parsed.secrets ?? {})) {
      const opened = await unseal(sealed);
      secrets[id] = opened.secret;
      rotated = rotated || opened.rotated;
    }
    const records = parsed.records ?? [];
    if (rotated) await this.persist(records, secrets);
    return { records, secrets };
  }

  async persist(records: PublicConnection[], secrets: Record<string, SecretMaterial>): Promise<void> {
    const sealed: Record<string, string> = {};
    for (const [id, secret] of Object.entries(secrets)) sealed[id] = await seal(secret);
    const file = this.file();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ records, secrets: sealed }, null, 2), { mode: 0o600 });
  }
}

export function secretsAreEncrypted(): Promise<boolean> {
  return safeStorage.isAsyncEncryptionAvailable();
}

async function seal(secret: SecretMaterial): Promise<string> {
  const json = JSON.stringify(secret);
  if (await safeStorage.isAsyncEncryptionAvailable()) {
    const encrypted = await safeStorage.encryptStringAsync(json);
    return `enc:${Buffer.from(encrypted).toString("base64")}`;
  }
  return `plain:${Buffer.from(json, "utf8").toString("base64")}`;
}

async function unseal(value: string): Promise<{ secret: SecretMaterial; rotated: boolean }> {
  try {
    if (value.startsWith("enc:") && (await safeStorage.isAsyncEncryptionAvailable())) {
      const decrypted = await safeStorage.decryptStringAsync(Buffer.from(value.slice(4), "base64"));
      return { secret: JSON.parse(decrypted.result) as SecretMaterial, rotated: decrypted.shouldReEncrypt };
    }
    if (value.startsWith("plain:")) {
      return { secret: JSON.parse(Buffer.from(value.slice(6), "base64").toString("utf8")) as SecretMaterial, rotated: false };
    }
  } catch {
    return { secret: {}, rotated: false };
  }
  return { secret: {}, rotated: false };
}
