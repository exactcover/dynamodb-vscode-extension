import type { KeyAttributeType } from "./types";

const ATTR_KEYS = new Set(["S", "N", "BOOL", "NULL", "B", "SS", "NS", "BS", "L", "M"]);

export function bytesToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i += 1) {
    binary += String.fromCharCode(data[i] ?? 0);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const cleaned = value.replace(/\s/g, "");
  if (!cleaned || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 === 1) {
    throw new Error("Invalid base64.");
  }
  const binary = atob(cleaned);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** Keep DynamoDB numeric strings that JavaScript cannot round-trip. */
export function isSafeDynamoNumber(raw: string): boolean {
  if (raw.includes("e") || raw.includes("E") || raw.startsWith("+")) return false;
  if (/^-?0\d/.test(raw)) return false;
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) return false;
  const digits = raw.replace("-", "").replace(".", "");
  if (digits.length > 15) return false;
  const n = Number(raw);
  if (!Number.isFinite(n)) return false;
  return formatJsNumber(n) === normalizeDecimal(raw);
}

function normalizeDecimal(raw: string): string {
  let sign = "";
  let value = raw;
  if (value.startsWith("-")) {
    sign = "-";
    value = value.slice(1);
  }
  if (value.includes(".")) {
    value = value.replace(/0+$/, "").replace(/\.$/, "");
  }
  if (value.startsWith(".")) value = `0${value}`;
  if (value === "") value = "0";
  return `${sign === "-" && value !== "0" ? sign : ""}${value}`;
}

function formatJsNumber(n: number): string {
  if (Object.is(n, -0)) return "0";
  return normalizeDecimal(String(n));
}

export function numberToDynamo(n: number): string {
  if (!Number.isFinite(n)) throw new Error("Number must be finite.");
  if (Object.is(n, -0)) return "0";
  return String(n);
}

export interface AttributeValueLike {
  S?: string;
  N?: string;
  BOOL?: boolean;
  NULL?: boolean;
  B?: Uint8Array;
  SS?: string[];
  NS?: string[];
  BS?: Uint8Array[];
  L?: AttributeValueLike[];
  M?: Record<string, AttributeValueLike>;
}

function isSpecial(value: Record<string, unknown>, key: string): boolean {
  return Object.keys(value).length === 1 && key in value;
}

export function toAttributeValue(value: unknown): AttributeValueLike {
  if (value === null) return { NULL: true };
  if (value === undefined) throw new Error("undefined is not a DynamoDB value.");
  if (typeof value === "string") return { S: value };
  if (typeof value === "number") return { N: numberToDynamo(value) };
  if (typeof value === "boolean") return { BOOL: value };
  if (typeof value === "bigint") return { N: value.toString() };
  if (Array.isArray(value)) return { L: value.map((entry) => toAttributeValue(entry)) };
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (isSpecial(record, "$n")) {
      const raw = String(record.$n).trim();
      if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) {
        throw new Error(`Invalid DynamoDB number "${raw}".`);
      }
      return { N: raw };
    }
    if (isSpecial(record, "$bin")) return { B: base64ToBytes(String(record.$bin)) };
    if (isSpecial(record, "$ss")) return { SS: stringSet(record.$ss, "string set") };
    if (isSpecial(record, "$ns")) return { NS: numberSet(record.$ns) };
    if (isSpecial(record, "$bs")) return { BS: binarySet(record.$bs) };
    const mapped: Record<string, AttributeValueLike> = {};
    for (const [key, entry] of Object.entries(record)) {
      if (entry === undefined) continue;
      mapped[key] = toAttributeValue(entry);
    }
    return { M: mapped };
  }
  throw new Error(`Unsupported value type: ${typeof value}`);
}

function stringSet(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`A ${label} must be a non-empty array of strings.`);
  }
  if (new Set(value).size !== value.length) throw new Error(`A ${label} cannot contain duplicates.`);
  return value;
}

function numberSet(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("A number set must be a non-empty array.");
  const numbers = value.map((entry) => {
    if (typeof entry === "number") return numberToDynamo(entry);
    const raw = String(entry).trim();
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) {
      throw new Error(`Invalid number set value "${raw}".`);
    }
    return raw;
  });
  if (new Set(numbers).size !== numbers.length) throw new Error("A number set cannot contain duplicates.");
  return numbers;
}

function binarySet(value: unknown): Uint8Array[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string")) {
    throw new Error("A binary set must be a non-empty array of base64 strings.");
  }
  return value.map((entry) => base64ToBytes(entry));
}

export function fromAttributeValue(value: AttributeValueLike, numbers: "native" | "preserve" = "native"): unknown {
  if (value.S !== undefined) return value.S;
  if (value.N !== undefined) {
    if (numbers === "preserve" || !isSafeDynamoNumber(value.N)) return { $n: value.N };
    return Number(value.N);
  }
  if (value.BOOL !== undefined) return value.BOOL;
  if (value.NULL) return null;
  if (value.B) return { $bin: bytesToBase64(value.B) };
  if (value.SS) return { $ss: [...value.SS] };
  if (value.NS) return { $ns: [...value.NS] };
  if (value.BS) return { $bs: value.BS.map((entry) => bytesToBase64(entry)) };
  if (value.L) return value.L.map((entry) => fromAttributeValue(entry, numbers));
  if (value.M) return fromAttributeMap(value.M, numbers);
  throw new Error("Unsupported DynamoDB attribute value.");
}

export function toAttributeMap(item: Record<string, unknown>): Record<string, AttributeValueLike> {
  const out: Record<string, AttributeValueLike> = {};
  for (const [key, value] of Object.entries(item)) {
    if (value === undefined) continue;
    out[key] = toAttributeValue(value);
  }
  return out;
}

export function fromAttributeMap(
  item: Record<string, AttributeValueLike>,
  numbers: "native" | "preserve" = "native",
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) out[key] = fromAttributeValue(value, numbers);
  return out;
}

export function looksLikeAttributeValue(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && ATTR_KEYS.has(keys[0] ?? "");
}

export function looksLikeAttributeMap(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.values(value);
  return entries.length > 0 && entries.every((entry) => looksLikeAttributeValue(entry));
}

/** Convert AWS console / CLI JSON (`{ "id": { "S": "a" } }`) into editable JSON. */
export function editableFromWire(value: unknown): unknown {
  if (!looksLikeAttributeValue(value)) throw new Error("Not a DynamoDB attribute value.");
  const av = value as Record<string, unknown>;
  if ("S" in av) return String(av.S);
  if ("N" in av) {
    const raw = String(av.N);
    return isSafeDynamoNumber(raw) ? Number(raw) : { $n: raw };
  }
  if ("BOOL" in av) return Boolean(av.BOOL);
  if ("NULL" in av) return null;
  if ("B" in av) return { $bin: String(av.B) };
  if ("SS" in av) return { $ss: av.SS };
  if ("NS" in av) return { $ns: av.NS };
  if ("BS" in av) return { $bs: av.BS };
  if ("L" in av && Array.isArray(av.L)) return av.L.map((entry) => editableFromWire(entry));
  if ("M" in av && av.M && typeof av.M === "object" && !Array.isArray(av.M)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(av.M)) out[key] = editableFromWire(entry);
    return out;
  }
  throw new Error("Unsupported attribute value.");
}

export function coerceKeyInput(raw: string, type: KeyAttributeType): unknown {
  const text = raw.trim();
  if (!text) throw new Error("Key value is required.");
  if (type === "S") return text;
  if (type === "N") {
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
      throw new Error(`Key must be a number. Received "${raw}".`);
    }
    return isSafeDynamoNumber(text) ? Number(text) : { $n: text };
  }
  return { $bin: text };
}

export function editableFromAttributeMap(value: unknown): Record<string, unknown> {
  if (!looksLikeAttributeMap(value)) throw new Error("Not a DynamoDB item.");
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = editableFromWire(entry);
  }
  return out;
}

/** Accept either one attribute value or a console/CLI item. */
export function editableFromAwsJson(value: unknown): unknown {
  if (looksLikeAttributeMap(value)) return editableFromAttributeMap(value);
  if (looksLikeAttributeValue(value)) return editableFromWire(value);
  throw new Error('This is not DynamoDB JSON. Expected { "attr": { "S": "value" } }.');
}

export function normalizeImportedItems(value: unknown): Record<string, unknown>[] {
  const items = unwrapItems(value);
  if (items.length === 0) throw new Error("The file has no items.");
  if (items.length > 200) throw new Error("Import up to 200 items at a time.");
  return items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Item ${index + 1} must be a JSON object.`);
    }
    const editable = looksLikeAttributeMap(item) ? editableFromAttributeMap(item) : item;
    if (!editable || typeof editable !== "object" || Array.isArray(editable)) {
      throw new Error(`Item ${index + 1} must be a JSON object.`);
    }
    return editable as Record<string, unknown>;
  });
}

function unwrapItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)) {
    return (value as { items: unknown[] }).items;
  }
  if (value && typeof value === "object") return [value];
  throw new Error('JSON must be an item, an array of items, or { "items": [] }.');
}
