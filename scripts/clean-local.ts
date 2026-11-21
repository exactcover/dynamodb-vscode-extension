import { DeleteTableCommand, DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb";

const endpoint = process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000";
const host = new URL(endpoint).hostname;
if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
  throw new Error(`Refusing to delete tables at ${endpoint}. This script only cleans localhost.`);
}

const client = new DynamoDBClient({
  region: process.env.AWS_DEFAULT_REGION ?? "us-east-1",
  endpoint,
  credentials: {
    accessKeyId: "local",
    secretAccessKey: "local",
  },
});

const names: string[] = [];
let start: string | undefined;
do {
  const page = await client.send(new ListTablesCommand({ ExclusiveStartTableName: start, Limit: 100 }));
  names.push(...(page.TableNames ?? []));
  start = page.LastEvaluatedTableName;
} while (start);

if (names.length === 0) {
  console.log(`No tables at ${endpoint}`);
} else {
  for (const tableName of names) {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
    console.log(`Deleted ${tableName}`);
  }
}

client.destroy();
