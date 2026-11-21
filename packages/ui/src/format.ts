import type { TableDescription } from "@dynamodb-client/protocol";

export function previewValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 1 && keys[0] === "$n") return String(record.$n);
    if (keys.length === 1 && keys[0] === "$ss" && Array.isArray(record.$ss)) return record.$ss.join(", ");
    if (keys.length === 1 && keys[0] === "$ns" && Array.isArray(record.$ns)) return record.$ns.join(", ");
    if (keys.length === 1 && keys[0] === "$bin") return "binary";
    if (keys.length === 1 && keys[0] === "$bs") return "binary set";
  }
  const json = JSON.stringify(value);
  return json.length > 160 ? `${json.slice(0, 157)}…` : json;
}

export function itemKeyId(item: Record<string, unknown>, keyNames: string[]): string {
  return JSON.stringify(keyNames.map((name) => item[name] ?? null));
}

export function columnsFor(items: Record<string, unknown>[], keyNames: string[]): string[] {
  const seen = new Set<string>(keyNames);
  for (const item of items) {
    for (const key of Object.keys(item)) seen.add(key);
  }
  const rest = [...seen].filter((key) => !keyNames.includes(key)).toSorted((a, b) => a.localeCompare(b));
  return [...keyNames, ...rest];
}

export function knownAttributes(description: TableDescription | undefined, items: Record<string, unknown>[]): string[] {
  const names = new Set<string>();
  for (const key of description?.keys ?? []) names.add(key.name);
  for (const index of description?.indexes ?? []) {
    for (const key of index.keys) names.add(key.name);
  }
  for (const item of items) {
    for (const key of Object.keys(item)) names.add(key);
  }
  return [...names].toSorted((a, b) => a.localeCompare(b));
}

export function formatBytes(size?: number): string {
  if (size === undefined) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function modeLabel(mode: string): string {
  if (mode === "local") return "Local";
  if (mode === "profile") return "Profile";
  if (mode === "keys") return "Access keys";
  return "Default chain";
}
