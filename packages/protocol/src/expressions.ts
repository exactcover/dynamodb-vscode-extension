import type { BuiltExpression, SortOperator } from "./types";

const SORT_SQL: Record<SortOperator, string> = {
  eq: "#sk = :sk",
  lt: "#sk < :sk",
  lte: "#sk <= :sk",
  gt: "#sk > :sk",
  gte: "#sk >= :sk",
  begins_with: "begins_with(#sk, :sk)",
  between: "#sk BETWEEN :sk AND :sk2",
};

export function buildKeyCondition(input: {
  partitionKeyName: string;
  partitionKeyValue: unknown;
  sortKeyName?: string;
  sortKeyOperator?: SortOperator;
  sortKeyValue?: unknown;
  sortKeyValue2?: unknown;
}): BuiltExpression {
  if (input.partitionKeyValue === undefined || input.partitionKeyValue === "") {
    throw new Error("Partition key value is required.");
  }
  const names: Record<string, string> = { "#pk": input.partitionKeyName };
  const values: Record<string, unknown> = { ":pk": input.partitionKeyValue };
  let expression = "#pk = :pk";
  if (!input.sortKeyOperator) return { expression, names, values };
  if (!input.sortKeyName) throw new Error("This index has no sort key.");
  if (input.sortKeyValue === undefined || input.sortKeyValue === "") {
    throw new Error("Sort key value is required.");
  }
  if (input.sortKeyOperator === "between" && (input.sortKeyValue2 === undefined || input.sortKeyValue2 === "")) {
    throw new Error("Between needs a start and an end value.");
  }
  names["#sk"] = input.sortKeyName;
  values[":sk"] = input.sortKeyValue;
  if (input.sortKeyOperator === "between") values[":sk2"] = input.sortKeyValue2;
  expression += ` AND ${SORT_SQL[input.sortKeyOperator]}`;
  return { expression, names, values };
}

/** OR of `contains` checks. Attribute names go through ExpressionAttributeNames. */
export function buildContainsFilter(attributes: string[], text: string): BuiltExpression {
  const unique = [...new Set(attributes.map((name) => name.trim()).filter(Boolean))].slice(0, 8);
  if (unique.length === 0) throw new Error("No attributes to search.");
  if (!text) throw new Error("Enter text to search.");
  const names: Record<string, string> = {};
  const parts: string[] = [];
  unique.forEach((name, index) => {
    const placeholder = `#a${index}`;
    names[placeholder] = name;
    parts.push(`contains(${placeholder}, :q)`);
  });
  return { expression: parts.join(" OR "), names, values: { ":q": text } };
}

export function clampLimit(value: unknown, fallback = 50): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(200, Math.max(1, Math.floor(parsed)));
}
