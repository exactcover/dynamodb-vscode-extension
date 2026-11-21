import { errorMessage, type Host, type ServiceFactory } from "@dynamodb-client/core";
import type { PublicConnection } from "@dynamodb-client/protocol";
import * as vscode from "vscode";

export type TreeNode =
  | { kind: "connection"; connection: PublicConnection }
  | { kind: "table"; connectionId: string; tableName: string }
  | { kind: "error"; message: string };

export class ConnectionTree implements vscode.TreeDataProvider<TreeNode> {
  private readonly emitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly host: Host,
    private readonly services: ServiceFactory,
  ) {}

  refresh(): void {
    this.emitter.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.kind === "connection") {
      const item = new vscode.TreeItem(element.connection.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.description = `${element.connection.mode} · ${element.connection.region}`;
      item.contextValue = "connection";
      item.iconPath = new vscode.ThemeIcon("plug");
      item.command = {
        command: "dynamodb.open",
        title: "Open",
        arguments: [{ connectionId: element.connection.id }],
      };
      return item;
    }
    if (element.kind === "table") {
      const item = new vscode.TreeItem(element.tableName, vscode.TreeItemCollapsibleState.None);
      item.contextValue = "table";
      item.iconPath = new vscode.ThemeIcon("table");
      item.command = {
        command: "dynamodb.open",
        title: "Open table",
        arguments: [{ connectionId: element.connectionId, tableName: element.tableName }],
      };
      return item;
    }
    const error = new vscode.TreeItem(element.message, vscode.TreeItemCollapsibleState.None);
    error.iconPath = new vscode.ThemeIcon("error");
    error.contextValue = "error";
    return error;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (!element) {
      const connections = await this.host.connections.list();
      return connections.map((connection) => ({ kind: "connection", connection }));
    }
    if (element.kind !== "connection") return [];
    try {
      const service = this.services.get(await this.host.connections.configFor(element.connection.id));
      const tables = await service.listTables();
      return tables.map((tableName) => ({ kind: "table", connectionId: element.connection.id, tableName }));
    } catch (err) {
      return [{ kind: "error", message: errorMessage(err) }];
    }
  }
}
