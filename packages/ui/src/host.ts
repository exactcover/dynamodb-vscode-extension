export interface HostEvent {
  connectionId?: string;
  tableName?: string;
  addConnection?: boolean;
}

export interface Transport {
  request<T>(method: string, params?: unknown): Promise<T>;
  subscribe(listener: (event: HostEvent) => void): () => void;
}

export function readBoot(): HostEvent {
  const meta = document.querySelector('meta[name="dynamo-boot"]');
  const raw = meta?.getAttribute("content");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as HostEvent;
    return {
      connectionId: parsed.connectionId,
      tableName: parsed.tableName,
      addConnection: parsed.addConnection,
    };
  } catch {
    return {};
  }
}

export function createTransport(): Transport {
  const listeners = new Set<(event: HostEvent) => void>();
  const subscribe = (listener: (event: HostEvent) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const emit = (event: HostEvent) => {
    for (const listener of listeners) listener(event);
  };

  if (window.desktopHost) {
    document.body.classList.add("host-desktop");
    const desktop = window.desktopHost;
    return {
      subscribe,
      async request<T>(method: string, params?: unknown): Promise<T> {
        try {
          return (await desktop.request({ method, params })) as T;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ""), { cause: err });
        }
      },
    };
  }

  if (window.acquireVsCodeApi) {
    const vscode = window.acquireVsCodeApi();
    let seq = 0;
    const pending = new Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();
    window.addEventListener("message", (event: MessageEvent) => {
      const message = event.data as
        | { kind: "response"; id: number; ok: boolean; result?: unknown; error?: string }
        | ({ kind: "navigate" } & HostEvent)
        | undefined;
      if (!message || typeof message !== "object") return;
      if (message.kind === "response") {
        const waiter = pending.get(message.id);
        if (!waiter) return;
        pending.delete(message.id);
        if (message.ok) waiter.resolve(message.result);
        else waiter.reject(new Error(message.error || "Request failed."));
        return;
      }
      if (message.kind === "navigate") emit(message);
    });
    return {
      subscribe,
      request<T>(method: string, params?: unknown) {
        const id = ++seq;
        return new Promise<T>((resolve, reject) => {
          pending.set(id, { resolve: (value) => resolve(value as T), reject });
          vscode.postMessage({ kind: "request", id, method, params });
        });
      },
    };
  }

  document.body.classList.add("host-desktop");
  return {
    subscribe,
    async request() {
      throw new Error("Open DynamoDB Client from VS Code, or run the desktop app.");
    },
  };
}
