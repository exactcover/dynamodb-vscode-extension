import { ConnectionBook, ServiceCache, createDispatcher, type Host } from "@dynamodb-client/core";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { ClientPanel, type PanelTarget } from "./panel";
import { VsCodeConnectionRepository } from "./repository";
import { ConnectionTree, type TreeNode } from "./tree";

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel("DynamoDB Client");
  const book = new ConnectionBook(new VsCodeConnectionRepository(context));
  const services = new ServiceCache();
  const host: Host = {
    connections: book,
    appInfo: async () => ({ encryption: true, platform: process.platform, product: "vscode" }),
    saveJsonFile: (suggestedName, contents) => saveJson(suggestedName, contents),
    pickJsonFile: () => pickJson(),
    writeClipboard: async (text) => {
      await vscode.env.clipboard.writeText(text);
    },
  };
  const dispatch = createDispatcher(host, services);
  const tree = new ConnectionTree(host, services);
  const panel = new ClientPanel(context, dispatch, log, () => tree.refresh());

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  status.text = "$(database) DynamoDB";
  status.tooltip = "Open DynamoDB Client";
  status.command = "dynamodb.open";
  status.show();

  context.subscriptions.push(
    log,
    status,
    vscode.window.registerTreeDataProvider("dynamodb.connections", tree),
    vscode.commands.registerCommand("dynamodb.open", (target?: PanelTarget) => panel.open(target ?? {})),
    vscode.commands.registerCommand("dynamodb.addConnection", () => panel.open({ addConnection: true })),
    vscode.commands.registerCommand("dynamodb.refresh", () => tree.refresh()),
    vscode.commands.registerCommand("dynamodb.showLog", () => log.show()),
    vscode.commands.registerCommand("dynamodb.deleteConnection", async (node?: TreeNode) => {
      if (!node || node.kind !== "connection") return;
      const choice = await vscode.window.showWarningMessage(
        `Remove connection “${node.connection.name}”? Tables in DynamoDB are not deleted.`,
        { modal: true },
        "Delete",
      );
      if (choice !== "Delete") return;
      await book.delete(node.connection.id);
      tree.refresh();
    }),
  );
}

export function deactivate(): void {}

async function saveJson(suggestedName: string, contents: string): Promise<boolean> {
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(os.homedir(), suggestedName)),
    filters: { JSON: ["json"] },
  });
  if (!uri) return false;
  await vscode.workspace.fs.writeFile(uri, Buffer.from(contents, "utf8"));
  return true;
}

async function pickJson(): Promise<string | null> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { JSON: ["json"] },
  });
  const uri = picked?.[0];
  if (!uri) return null;
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString("utf8");
}
