export type {
  BuiltExpression,
  ClientConfig,
  ConnectionInput,
  ConnectionMode,
  CreateIndexInput,
  CreateTableInput,
  DeleteItemInput,
  GetItemInput,
  ImportItemsInput,
  ImportItemsResult,
  IndexDescription,
  ItemPage,
  KeyAttributeType,
  LocalIndexInput,
  KeySchema,
  PublicConnection,
  PutItemInput,
  QueryItemsInput,
  ScanItemsInput,
  SearchItemsInput,
  SecretMaterial,
  SortOperator,
  StatementInput,
  StatementResult,
  TableDescription,
} from "./types";

export type { AttributeValueLike } from "./convert";

export {
  base64ToBytes,
  bytesToBase64,
  coerceKeyInput,
  editableFromAttributeMap,
  editableFromAwsJson,
  editableFromWire,
  fromAttributeMap,
  fromAttributeValue,
  isSafeDynamoNumber,
  looksLikeAttributeMap,
  looksLikeAttributeValue,
  normalizeImportedItems,
  numberToDynamo,
  toAttributeMap,
  toAttributeValue,
} from "./convert";

export { buildContainsFilter, buildKeyCondition, clampLimit } from "./expressions";

export {
  applyConnectionUpdate,
  assertAttributeName,
  assertTableName,
  extractKey,
  sameKey,
  toClientConfig,
  validateConnectionInput,
} from "./validate";
