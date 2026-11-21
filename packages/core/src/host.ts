import type { ConnectionBook } from "./connections";

export interface AppInfo {
  encryption: boolean;
  platform: string;
  product: "vscode" | "desktop";
}

export interface Host {
  connections: ConnectionBook;
  appInfo(): Promise<AppInfo>;
  saveJsonFile(suggestedName: string, contents: string): Promise<boolean>;
  pickJsonFile(): Promise<string | null>;
  writeClipboard(text: string): Promise<void>;
}
