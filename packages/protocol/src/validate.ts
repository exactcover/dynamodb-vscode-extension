import type { ClientConfig, ConnectionInput, ConnectionMode, PublicConnection, SecretMaterial } from "./types";

const MODES = new Set<ConnectionMode>(["local", "profile", "keys", "default"]);
const TABLE_NAME = /^[A-Za-z0-9_.-]{3,255}$/;
const REGION = /^[a-z0-9-]+$/;

export function assertTableName(name: string): string {
  const trimmed = name.trim();
  if (!TABLE_NAME.test(trimmed)) {
    throw new Error("Table names are 3–255 characters: letters, numbers, underscore, hyphen, or dot.");
  }
  return trimmed;
}

export function assertAttributeName(name: string, label = "Attribute name"): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 255) throw new Error(`${label} must be 1–255 characters.`);
  return trimmed;
}

export function validateConnectionInput(input: ConnectionInput): void {
  if (!input || typeof input !== "object") throw new Error("Connection is required.");
  if (!input.name?.trim()) throw new Error("Connection name is required.");
  if (!input.region?.trim() || !REGION.test(input.region.trim())) {
    throw new Error("Region is required, for example eu-west-1.");
  }
  if (!MODES.has(input.mode)) throw new Error("Unknown connection mode.");
  const endpoint = input.endpoint?.trim();
  if (input.mode === "local" && !endpoint) throw new Error("DynamoDB Local needs an endpoint URL.");
  if (endpoint && !/^https?:\/\/\S+$/.test(endpoint)) throw new Error("Endpoint must be an http(s) URL.");
  if (input.mode === "profile" && !input.profile?.trim()) throw new Error("AWS profile name is required.");
  if (input.mode === "keys" && !input.id) {
    if (!input.accessKeyId?.trim()) throw new Error("Access key ID is required.");
    if (!input.secretAccessKey?.trim()) throw new Error("Secret access key is required.");
  }
}

export function applyConnectionUpdate(
  input: ConnectionInput,
  previous?: { id: string; secret: SecretMaterial },
): { record: PublicConnection; secret: SecretMaterial } {
  validateConnectionInput(input);
  const id = input.id ?? crypto.randomUUID();
  const isNew = !previous;
  let secret: SecretMaterial = {};
  if (input.mode === "local") {
    secret = {
      accessKeyId: input.accessKeyId?.trim() || "local",
      secretAccessKey: input.secretAccessKey?.trim() || "local",
    };
  } else if (input.mode === "keys") {
    const accessKeyId = input.accessKeyId?.trim() || previous?.secret.accessKeyId;
    const secretAccessKey = input.secretAccessKey?.trim() || previous?.secret.secretAccessKey;
    if (!accessKeyId || !secretAccessKey) throw new Error("Access key ID and secret access key are required.");
    let sessionToken: string | undefined;
    if (input.sessionToken === null) sessionToken = undefined;
    else if (typeof input.sessionToken === "string" && input.sessionToken.trim()) sessionToken = input.sessionToken.trim();
    else sessionToken = isNew ? undefined : previous?.secret.sessionToken;
    secret = { accessKeyId, secretAccessKey, sessionToken };
  }
  const record: PublicConnection = {
    id,
    name: input.name.trim(),
    region: input.region.trim(),
    mode: input.mode,
    hasSecret: Boolean(secret.secretAccessKey),
    hasSessionToken: Boolean(secret.sessionToken),
  };
  const endpoint = input.endpoint?.trim();
  if (endpoint) record.endpoint = endpoint;
  if (input.mode === "profile" && input.profile?.trim()) record.profile = input.profile.trim();
  if (secret.accessKeyId && input.mode !== "local") record.accessKeyId = secret.accessKeyId;
  return { record, secret };
}

export function toClientConfig(record: PublicConnection, secret: SecretMaterial): ClientConfig {
  return {
    id: record.id,
    region: record.region,
    mode: record.mode,
    endpoint: record.endpoint,
    profile: record.profile,
    accessKeyId: secret.accessKeyId,
    secretAccessKey: secret.secretAccessKey,
    sessionToken: secret.sessionToken,
  };
}

export function extractKey(item: Record<string, unknown>, keyNames: string[]): Record<string, unknown> {
  const key: Record<string, unknown> = {};
  for (const name of keyNames) {
    if (!(name in item) || item[name] === undefined || item[name] === "") {
      throw new Error(`Item is missing key attribute "${name}".`);
    }
    key[name] = item[name];
  }
  return key;
}

export function sameKey(left: Record<string, unknown>, right: Record<string, unknown>, keyNames: string[]): boolean {
  return keyNames.every((name) => JSON.stringify(left[name]) === JSON.stringify(right[name]));
}
