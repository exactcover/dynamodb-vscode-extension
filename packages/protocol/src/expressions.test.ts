import { describe, expect, it } from "vitest";
import { applyConnectionUpdate, buildContainsFilter, buildKeyCondition, clampLimit, coerceKeyInput } from "./index";

describe("key conditions", () => {
  it("builds a partition key equality without putting the name in the expression", () => {
    const built = buildKeyCondition({
      partitionKeyName: "name",
      partitionKeyValue: "Ada",
    });
    expect(built.expression).toBe("#pk = :pk");
    expect(built.names).toEqual({ "#pk": "name" });
    expect(built.values).toEqual({ ":pk": "Ada" });
  });

  it("builds a between sort condition", () => {
    const built = buildKeyCondition({
      partitionKeyName: "pk",
      partitionKeyValue: "user",
      sortKeyName: "sk",
      sortKeyOperator: "between",
      sortKeyValue: "a",
      sortKeyValue2: "z",
    });
    expect(built.expression).toBe("#pk = :pk AND #sk BETWEEN :sk AND :sk2");
    expect(built.values[":sk2"]).toBe("z");
  });

  it("requires both ends of a between", () => {
    expect(() =>
      buildKeyCondition({
        partitionKeyName: "pk",
        partitionKeyValue: "user",
        sortKeyName: "sk",
        sortKeyOperator: "between",
        sortKeyValue: "a",
      }),
    ).toThrow(/Between/);
  });
});

describe("contains filter", () => {
  it("ors string attributes and passes the text as a value", () => {
    const built = buildContainsFilter(["email", "email", "name"], "ada");
    expect(built.expression).toBe("contains(#a0, :q) OR contains(#a1, :q)");
    expect(built.names).toEqual({ "#a0": "email", "#a1": "name" });
    expect(built.values).toEqual({ ":q": "ada" });
    expect(built.expression.includes("ada")).toBe(false);
  });
});

describe("limits and keys", () => {
  it("clamps page size", () => {
    expect(clampLimit(undefined)).toBe(50);
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(500)).toBe(200);
  });

  it("coerces numeric keys and preserves big integers", () => {
    expect(coerceKeyInput(" 42 ", "N")).toBe(42);
    expect(coerceKeyInput("9007199254740993", "N")).toEqual({ $n: "9007199254740993" });
    expect(coerceKeyInput("ada", "S")).toBe("ada");
  });
});

describe("connections", () => {
  it("keeps a saved secret when the edit form leaves it blank", () => {
    const saved = applyConnectionUpdate(
      {
        id: "c1",
        name: "Work",
        region: "us-east-1",
        mode: "keys",
        accessKeyId: "AKIA_TEST",
        secretAccessKey: "",
        sessionToken: "",
      },
      { id: "c1", secret: { accessKeyId: "AKIA_TEST", secretAccessKey: "secret", sessionToken: "tok" } },
    );
    expect(saved.secret.secretAccessKey).toBe("secret");
    expect(saved.secret.sessionToken).toBe("tok");
    expect(saved.record.hasSecret).toBe(true);
  });

  it("clears a session token when asked", () => {
    const saved = applyConnectionUpdate(
      {
        id: "c1",
        name: "Work",
        region: "us-east-1",
        mode: "keys",
        accessKeyId: "AKIA_TEST",
        sessionToken: null,
      },
      { id: "c1", secret: { accessKeyId: "AKIA_TEST", secretAccessKey: "secret", sessionToken: "tok" } },
    );
    expect(saved.secret.sessionToken).toBeUndefined();
    expect(saved.record.hasSessionToken).toBe(false);
  });

  it("fills dummy credentials for DynamoDB Local", () => {
    const saved = applyConnectionUpdate({
      name: "Local",
      region: "us-east-1",
      mode: "local",
      endpoint: "http://localhost:8000",
    });
    expect(saved.secret).toEqual({ accessKeyId: "local", secretAccessKey: "local" });
    expect(saved.record.endpoint).toBe("http://localhost:8000");
  });
});
