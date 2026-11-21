import { CreateTableCommand, DynamoDBClient, PutItemCommand, ResourceInUseException } from "@aws-sdk/client-dynamodb";

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

await client.send(
  new PutItemCommand({
    TableName: "Users",
    Item: {
      pk: { S: "user" },
      sk: { S: "ada" },
      name: { S: "Ada Lovelace" },
      email: { S: "ada@example.com" },
      roles: { SS: ["admin", "dev"] },
    },
  }),
);

await client.send(
  new PutItemCommand({
    TableName: "Users",
    Item: {
      pk: { S: "user" },
      sk: { S: "grace" },
      name: { S: "Grace Hopper" },
      email: { S: "grace@example.com" },
      active: { BOOL: true },
    },
  }),
);

client.destroy();
console.log(`Seeded Users at ${endpoint}`);
