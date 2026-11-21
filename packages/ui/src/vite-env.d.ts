/// <reference types="vite/client" />

interface DynamoBoot {
  connectionId?: string;
  tableName?: string;
  addConnection?: boolean;
}

interface DesktopHost {
  request(message: { method: string; params?: unknown }): Promise<unknown>;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => { postMessage(message: unknown): void };
    desktopHost?: DesktopHost;
  }
}

export {};
