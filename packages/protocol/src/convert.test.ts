import { describe, expect, it } from "vitest";
import {
  editableFromWire,
  fromAttributeValue,
  isSafeDynamoNumber,
  normalizeImportedItems,
  toAttributeValue,
  type AttributeValueLike,
} from "./index";

describe("numbers", () => {
  it("treats ordinary integers and decimals as safe", () => {
    expect(isSafeDynamoNumber("10")).toBe(true);
    expect(isSafeDynamoNumber("1.50")).toBe(true);
    expect(isSafeDynamoNumber("0.1")).toBe(true);
    expect(isSafeDynamoNumber("-4")).toBe(true);
  });

  it("preserves integers JavaScript cannot round-trip and exponent forms", () => {
    expect(isSafeDynamoNumber("9007199254740993")).toBe(false);
    expect(isSafeDynamoNumber("1e2")).toBe(false);
    expect(isSafeDynamoNumber("01")).toBe(false);
  });
});

describe("attribute round-trip", () => {
  it("converts the editable JSON forms DynamoDB needs", () => {
    const item = {
      id: "user",
      age: 30,
      score: { $n: "9007199254740993" },
      active: true,
      note: null,
      tags: { $ss: ["a", "b"] },
      blob: { $bin: btoa("hi") },
      nested: { city: "London" },
      list: [1, "x"],
    };
    const wire = toAttributeValue(item);
    expect(wire.M?.id).toEqual({ S: "user" });
    expect(wire.M?.age).toEqual({ N: "30" });
    expect(wire.M?.score).toEqual({ N: "9007199254740993" });
    expect(wire.M?.tags).toEqual({ SS: ["a", "b"] });
    const back = fromAttributeValue(wire);
    expect(back).toEqual(item);
  });

  it("keeps the original numeric token for pagination keys", () => {
    const key = fromAttributeValue({ N: "1.50" }, "preserve");
    expect(key).toEqual({ $n: "1.50" });
    expect(toAttributeValue(key)).toEqual({ N: "1.50" });
  });

  it("rejects empty sets", () => {
    expect(() => toAttributeValue({ $ss: [] })).toThrow(/non-empty/);
  });
});

describe("AWS JSON", () => {
  it("converts console-style attribute maps", () => {
    const converted = editableFromWire({
      M: {
        pk: { S: "user" },
        age: { N: "42" },
        big: { N: "9007199254740993" },
      },
    });
    expect(converted).toEqual({
      pk: "user",
      age: 42,
      big: { $n: "9007199254740993" },
    });
  });

  it("accepts a file of CLI items", () => {
    const items = normalizeImportedItems([
      { pk: { S: "a" }, name: { S: "Ada" } },
      { pk: "b", name: "Grace" },
    ]);
    expect(items).toEqual([
      { pk: "a", name: "Ada" },
      { pk: "b", name: "Grace" },
    ]);
  });
});

describe("binary", () => {
  it("round-trips bytes including zero and 255", () => {
    const av: AttributeValueLike = { B: new Uint8Array([0, 1, 255]) };
    const editable = fromAttributeValue(av);
    expect(toAttributeValue(editable).B).toEqual(new Uint8Array([0, 1, 255]));
  });
});
