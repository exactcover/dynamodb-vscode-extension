# DynamoDB Client

A DynamoDB client for VS Code, plus the same client as a desktop app for Linux and macOS. It is meant to replace the slow parts of NoSQL Workbench: connect, list tables, page through items, query keys, search text, and create, edit, or delete items.

## What you can do

- Connect to DynamoDB Local, an AWS profile (including SSO), access keys, or the default AWS credential chain.
- Optional endpoint for DynamoDB Local or LocalStack.
- List, create, and delete on-demand tables.
- Browse items with paging. Query a table or index by partition key and sort key.
- Search text with a filtered scan across up to eight top-level string attributes, or one attribute you name.
- Run PartiQL when you need nested fields or an update statement.
- Create, replace, duplicate, and delete items in a JSON editor.
- Import and export JSON. Paste AWS console JSON and convert it.
- Keep access keys in VS Code Secret Storage, or in the OS keychain for the desktop app.

Text search is a DynamoDB scan, not a full-text index. It reads capacity. Type an attribute name when you know which field to search. Use PartiQL for nested attributes.

## Layout

- `packages/protocol` — JSON conversion, key conditions, and connection rules. No AWS SDK.
- `packages/core` — DynamoDB service and the request dispatcher both apps use.
- `packages/ui` — shared React interface.
- `packages/vscode` — VS Code extension.
- `packages/desktop` — Electron app for Linux and macOS.

## Run DynamoDB Local

```bash
docker run --rm -p 8000:8000 amazon/dynamodb-local
```

In the client, add a connection named DynamoDB Local, region `us-east-1`, endpoint `http://localhost:8000`.

To seed a sample table:

```bash
bash scripts/seed-local.sh
```

You can also create the table from the client.

## VS Code extension

Requirements: Node.js 22.12 or newer (24, or 26 and newer), [Bun](https://bun.sh) 1.4.5 or newer, and VS Code 1.90 or newer. This repo pins Node 26.13.1 in `.node-version`.

```bash
bun install
bun test
bun run build
```

Press F5 (the launch config is **Run DynamoDB Client**), or install the packaged extension:

```bash
bun run package:vscode
```

The vsix is written to `release/dynamodb-client.vsix`. Install it with **Extensions: Install from VSIX**.

Open the DynamoDB icon in the activity bar, or run **DynamoDB: Open Client**.

### Credentials

| Mode | Use it when |
| --- | --- |
| DynamoDB Local | `http://localhost:8000` or another local endpoint. Any dummy keys work. |
| AWS profile | A profile in `~/.aws/config`, including SSO. Run `aws sso login --profile name` first. |
| Access keys | An access key id and secret. Stored in VS Code Secret Storage, not in the workspace. |
| Default credential chain | The same lookup the AWS CLI uses: env vars, SSO, shared config, then an instance role. |

A custom endpoint on an AWS connection sends that account's calls to LocalStack or a VPC endpoint.

## Desktop app

```bash
bun install
bun run dev:desktop
```

That starts the shared UI and an Electron window.

Package an installable app for the machine you are on:

```bash
bun run package:desktop
```

- Linux builds an AppImage and a `.deb` in `release/desktop/`.
- macOS builds a `.zip` and a `.dmg`. Build those on a Mac. A Linux machine will not produce a signed Mac app.

Access keys are encrypted with the OS secret store when it is available (`safeStorage`). If it is not, the app says so and stores them in a `0600` file under the app's user-data directory. That fallback is not strong protection.

## Item JSON

The editor uses plain JSON.

- Strings, booleans, null, lists, and maps are themselves.
- Safe numbers stay numbers. A number JavaScript cannot round-trip is `{ "$n": "9007199254740993" }`.
- A string set is `{ "$ss": ["admin", "dev"] }`. A number set is `{ "$ns": ["1", "2"] }`.
- Binary is `{ "$bin": "<base64>" }`.

**Convert AWS JSON** accepts the console shape `{ "id": { "S": "user" } }`.

Saving an edited item replaces the whole item. If you change the key, you can delete the original after the new item is written. PartiQL `UPDATE` and `DELETE` are available for partial changes. Those statements ask for confirmation.

## Tests

```bash
bun test
bun run typecheck
```

The tests cover JSON conversion, query expressions, and saved connections. They do not call AWS. Point a connection at DynamoDB Local when you want to try the real API.

## Limits

- Page size is 1–200 items. A filtered scan keeps reading until it fills the page, stops after about 25 rounds, or reaches the end. Choose **Load more** or **Keep scanning** to continue.
- Import accepts up to 200 items and 5 MB.
- Create Table builds an on-demand table with a partition key and an optional sort key. Add indexes in AWS if you need them; the client can query indexes that already exist.
- Global secondary indexes are eventually consistent. The consistent-read checkbox is disabled for them.
