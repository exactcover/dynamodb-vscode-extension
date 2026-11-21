import {
  CreateTableCommand,
  DeleteItemCommand,
  DynamoDBClient,
  PutItemCommand,
  ResourceInUseException,
  ResourceNotFoundException,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";

const endpoint = process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000";
const client = new DynamoDBClient({
  region: process.env.AWS_DEFAULT_REGION ?? "us-east-1",
  endpoint,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "local",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "local",
  },
});

try {
  await client.send(
    new CreateTableCommand({
      TableName: "Users",
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
} catch (err) {
  if (!(err instanceof ResourceInUseException)) throw err;
}

const users: Record<string, AttributeValue>[] = [
  {
    pk: { S: "user" },
    sk: { S: "vishal" },
    name: { S: "Vishal Kumar Gupta" },
    email: { S: "vishal@example.com" },
    roles: { SS: ["admin", "dev"] },
    active: { BOOL: true },
  },
  {
    pk: { S: "user" },
    sk: { S: "john" },
    name: { S: "John Doe" },
    email: { S: "john.doe@example.com" },
    roles: { SS: ["dev"] },
    active: { BOOL: true },
  },
  {
    pk: { S: "user" },
    sk: { S: "jane" },
    name: { S: "Jane Doe" },
    email: { S: "jane.doe@example.com" },
    roles: { SS: ["reader"] },
    active: { BOOL: false },
  },
];

for (const item of users) {
  await client.send(new PutItemCommand({ TableName: "Users", Item: item }));
}

for (const sk of ["ada", "grace"]) {
  try {
    await client.send(
      new DeleteItemCommand({
        TableName: "Users",
        Key: { pk: { S: "user" }, sk: { S: sk } },
      }),
    );
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err;
  }
}

client.destroy();
console.log(`Seeded Users at ${endpoint}`);
