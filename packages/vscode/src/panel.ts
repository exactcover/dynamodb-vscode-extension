import { errorMessage, type Dispatcher } from "@dynamodb-client/core";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

export interface PanelTarget {
  connectionId?: string;
  tableName?: string;
  addConnection?: boolean;
}

interface RequestMessage {
  kind?: string;
  id?: number;
  method?: string;
  params?: unknown;
}

export class ClientPanel {
  private panel: vscode.WebviewPanel | undefined;
  private boot: PanelTarget = {};

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly dispatch: Dispatcher,
    private readonly log: vscode.OutputChannel,
    private readonly onDataChanged: () => void,
  ) {}

  open(target: PanelTarget = {}): void {
    this.boot = { ...this.boot, ...target };
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active);
      void this.panel.webview.postMessage({ kind: "navigate", ...target });
      return;
    }
    const panel = vscode.window.createWebviewPanel("dynamodb.client", "DynamoDB", vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(this.webviewRoot())],
    });
    this.panel = panel;
    panel.webview.html = this.html(panel.webview);
    panel.webview.onDidReceiveMessage((message: RequestMessage) => void this.onMessage(message));
    panel.onDidDispose(() => {
      this.panel = undefined;
    });
    this.context.subscriptions.push(panel);
  }

  private async onMessage(message: RequestMessage): Promise<void> {
    if (message.kind !== "request" || typeof message.id !== "number" || typeof message.method !== "string" || !this.panel) return;
    try {
      const result = await this.dispatch(message.method, message.params);
      if (
        message.method === "connections.save" ||
        message.method === "connections.delete" ||
        message.method === "tables.create" ||
        message.method === "tables.delete"
      ) {
        this.onDataChanged();
      }
      await this.panel.webview.postMessage({ kind: "response", id: message.id, ok: true, result });
    } catch (err) {
      const error = errorMessage(err);
      this.log.appendLine(`${message.method} failed: ${error}`);
      await this.panel.webview.postMessage({ kind: "response", id: message.id, ok: false, error });
    }
  }

  private webviewRoot(): string {
    return path.join(this.context.extensionPath, "dist", "webview");
  }

  private html(webview: vscode.Webview): string {
    const dist = this.webviewRoot();
    const indexPath = path.join(dist, "index.html");
    if (!fs.existsSync(indexPath)) {
      return "<!doctype html><html><body><p>UI bundle is missing. From the repository root, run <code>bun run build</code>.</p></body></html>";
    }
    const nonce = crypto.randomBytes(16).toString("hex");
    let html = fs.readFileSync(indexPath, "utf8");
    html = html.replace(/\s+crossorigin(?:="[^"]*")?/g, "");
    html = html.replace(/(src|href)="([^"]+)"/g, (full, attr: string, rel: string) => {
      if (/^(https?:|data:|#)/.test(rel)) return full;
      const file = rel.replace(/^\.\//, "").replace(/^\//, "");
      const uri = webview.asWebviewUri(vscode.Uri.file(path.join(dist, file)));
      return `${attr}="${uri}"`;
    });
    html = html.replace(/<script\b/g, `<script nonce="${nonce}"`);
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
    ].join("; ");
    const boot = encodeURIComponent(JSON.stringify(this.boot));
    return html.replace(
      "<head>",
      `<head><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="dynamo-boot" content="${boot}">`,
    );
  }
}

