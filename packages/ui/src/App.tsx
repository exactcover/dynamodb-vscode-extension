import { extractKey, normalizeImportedItems, type ItemPage, type PublicConnection, type TableDescription } from "@dynamodb-client/protocol";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createApi, type Api, type AppInfo } from "./api";
import { ConfirmDialog, Dialog } from "./components/Dialog";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { CreateTableDialog } from "./components/CreateTableDialog";
import { TableDefinitionDialog } from "./components/TableDefinitionDialog";
import { DataGrid } from "./components/DataGrid";
import { ItemDrawer } from "./components/ItemDrawer";
import { PartiQLDialog } from "./components/PartiQLDialog";
import { QueryBar, type PageRequest } from "./components/QueryBar";
import { Sidebar } from "./components/Sidebar";
import { columnsFor, formatBytes, itemKeyId, knownAttributes } from "./format";
import { createTransport, readBoot } from "./host";

const EMPTY_PAGE: ItemPage = { items: [], scannedCount: 0, count: 0 };

function blankItem(description?: TableDescription): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  for (const key of description?.keys ?? []) item[key.name] = key.type === "N" ? 0 : "";
  return item;
}

async function fetchPage(api: Api, connectionId: string, tableName: string, request: PageRequest, startKey?: Record<string, unknown>): Promise<ItemPage> {
  if (request.kind === "scan") {
    return api.scan({
      connectionId,
      tableName,
      limit: request.limit,
      consistentRead: request.consistentRead,
      indexName: request.indexName,
      exclusiveStartKey: startKey,
    });
  }
  if (request.kind === "search") {
    return api.search({
      connectionId,
      tableName,
      text: request.text,
      attribute: request.attribute,
      limit: request.limit,
      consistentRead: request.consistentRead,
      exclusiveStartKey: startKey,
    });
  }
  return api.query({
    connectionId,
    tableName,
    indexName: request.indexName,
    partitionKeyValue: request.partitionKeyValue,
    sortKeyOperator: request.sortKeyOperator,
    sortKeyValue: request.sortKeyValue,
    sortKeyValue2: request.sortKeyValue2,
    scanIndexForward: request.scanIndexForward,
    limit: request.limit,
    consistentRead: request.consistentRead,
    exclusiveStartKey: startKey,
  });
}

export function App() {
  const boot = useMemo(() => readBoot(), []);
  const transport = useMemo(() => createTransport(), []);
  const api = useMemo(() => createApi(transport), [transport]);
  const [connections, setConnections] = useState<PublicConnection[]>([]);
  const [connectionId, setConnectionId] = useState<string | undefined>(boot.connectionId);
  const [tables, setTables] = useState<string[]>([]);
  const [tableFilter, setTableFilter] = useState("");
  const [tableName, setTableName] = useState<string | undefined>();
  const [description, setDescription] = useState<TableDescription>();
  const [page, setPage] = useState<ItemPage>(EMPTY_PAGE);
  const [request, setRequest] = useState<PageRequest>({ kind: "scan", limit: 50, consistentRead: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<{ mode: "create" | "edit"; item: Record<string, unknown> }>();
  const [connectionDialog, setConnectionDialog] = useState<{ connection?: PublicConnection; presetLocal?: boolean } | undefined>(
    boot.addConnection ? {} : undefined,
  );
  const [profiles, setProfiles] = useState<string[]>([]);
  const [info, setInfo] = useState<AppInfo>({ encryption: true, platform: "", product: "vscode" });
  const [creatingTable, setCreatingTable] = useState(false);
  const [definitionOpen, setDefinitionOpen] = useState(false);
  const [partiql, setPartiql] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<string>();
  const [deleteTableText, setDeleteTableText] = useState("");
  const [confirm, setConfirm] = useState<{ title: string; body: string; confirmLabel: string; danger?: boolean; run: () => Promise<void> }>();
  const pageSeq = useRef(0);
  const pendingTable = useRef(boot.tableName);
  const [seenConnectionId, setSeenConnectionId] = useState(connectionId);
  const tableKey = `${connectionId ?? ""}\0${tableName ?? ""}`;
  const [seenTableKey, setSeenTableKey] = useState(tableKey);
  if (connectionId !== seenConnectionId) {
    setSeenConnectionId(connectionId);
    setTables([]);
    if (!connectionId) {
      setTableName(undefined);
      setDescription(undefined);
      setPage(EMPTY_PAGE);
    }
  }
  if (tableKey !== seenTableKey) {
    setSeenTableKey(tableKey);
    setDescription(undefined);
    if (!connectionId || !tableName) {
      setPage(EMPTY_PAGE);
      setEditor(undefined);
    }
  }

  const connection = connections.find((item) => item.id === connectionId);
  const keyNames = description?.keys.map((key) => key.name) ?? [];

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? undefined : current)), 4500);
  }, []);

  const load = useCallback(async (next: PageRequest, reset: boolean, startKey?: Record<string, unknown>) => {
    if (!connectionId || !tableName) return;
    const seq = ++pageSeq.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await fetchPage(api, connectionId, tableName, next, startKey);
      if (seq !== pageSeq.current) return;
      setRequest(next);
      setPage((prev) => {
        if (reset) return result;
        return {
          ...result,
          items: [...prev.items, ...result.items],
          scannedCount: prev.scannedCount + result.scannedCount,
          count: prev.count + result.count,
          capacityUnits: (prev.capacityUnits ?? 0) + (result.capacityUnits ?? 0),
        };
      });
      if (reset) setSelected(new Set());
    } catch (err) {
      if (seq !== pageSeq.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (seq === pageSeq.current) setLoading(false);
    }
  }, [api, connectionId, tableName]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await api.listConnections();
        if (!cancelled) setConnections(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    void (async () => {
      try {
        const rows = await api.profiles();
        if (!cancelled) setProfiles(rows);
      } catch {
        // The profile list is optional. The form still accepts a typed name.
      }
    })();
    void (async () => {
      try {
        const value = await api.info();
        if (!cancelled) setInfo(value);
      } catch {
        // App info only changes the credential warning.
      }
    })();
    return () => { cancelled = true; };
  }, [api]);

  useEffect(() => transport.subscribe((event) => {
    if (event.addConnection) setConnectionDialog({});
    if (event.tableName) pendingTable.current = event.tableName;
    if (event.connectionId && event.connectionId !== connectionId) {
      setTableName(undefined);
      setConnectionId(event.connectionId);
      return;
    }
    if (event.connectionId) setConnectionId(event.connectionId);
    if (event.tableName) setTableName(event.tableName);
  }), [connectionId, transport]);

  useEffect(() => {
    if (!connectionId) return;
    let cancelled = false;
    const wanted = pendingTable.current;
    pendingTable.current = undefined;
    void (async () => {
      try {
        const names = await api.listTables(connectionId);
        if (cancelled) return;
        setTables(names);
        setTableName((current) => {
          if (wanted && names.includes(wanted)) return wanted;
          if (current && names.includes(current)) return current;
          return undefined;
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [api, connectionId]);

  useEffect(() => {
    if (!connectionId || !tableName) {
      pageSeq.current += 1;
      return;
    }
    let cancelled = false;
    void (async () => {
      const described = api.describeTable(connectionId, tableName);
      // load() writes state before its first await. Yield so that write is not synchronous in this effect.
      await Promise.resolve();
      const pagePromise = cancelled ? Promise.resolve() : load({ kind: "scan", limit: 50, consistentRead: false }, true);
      try {
        const value = await described;
        if (!cancelled) setDescription(value);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
      await pagePromise;
    })();
    return () => { cancelled = true; };
  }, [api, connectionId, tableName, load]);

  async function refreshConnections() {
    setConnections(await api.listConnections());
  }

  async function refreshTables() {
    if (!connectionId) return;
    setLoading(true);
    try {
      const names = await api.listTables(connectionId);
      setTables(names);
      if (tableName) {
        setDescription(await api.describeTable(connectionId, tableName, true));
        await load(request, true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveItem(item: Record<string, unknown>, deleteOriginal: boolean) {
    if (!connectionId || !tableName || !description) return;
    const mode = editor?.mode === "create" ? "create" : "replace";
    await api.putItem(connectionId, tableName, item, mode);
    if (deleteOriginal && editor?.mode === "edit") {
      await api.deleteItem(connectionId, tableName, extractKey(editor.item, keyNames));
    }
    setEditor(undefined);
    flash(mode === "create" ? "Item created." : "Item saved.");
    await load(request, true);
  }

  async function deleteItems(items: Record<string, unknown>[]) {
    if (!connectionId || !tableName) return;
    if (items.length > 100) throw new Error("Delete up to 100 items at a time.");
    for (const item of items) await api.deleteItem(connectionId, tableName, extractKey(item, keyNames));
    setEditor(undefined);
    flash(items.length === 1 ? "Item deleted." : `Deleted ${items.length} items.`);
    await load(request, true);
  }

  async function copyItem(item: Record<string, unknown>) {
    await api.copy(JSON.stringify(item, null, 2));
    flash("Copied item JSON.");
  }

  async function exportItems() {
    if (!tableName) return;
    const chosen = page.items.filter((item) => selected.has(itemKeyId(item, keyNames)));
    const rows = chosen.length ? chosen : page.items;
    const saved = await api.saveJson(`${tableName}.json`, JSON.stringify(rows, null, 2));
    if (saved.saved) flash(`Exported ${rows.length} items.`);
  }

  async function importItems() {
    if (!connectionId || !tableName) return;
    const picked = await api.pickJson();
    if (!picked.contents) return;
    let items: Record<string, unknown>[];
    try {
      items = normalizeImportedItems(JSON.parse(picked.contents));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    setConfirm({
      title: "Import items",
      body: `Import ${items.length} items into ${tableName}. An existing item with the same key is replaced.`,
      confirmLabel: "Import",
      run: async () => {
        const result = await api.importItems(connectionId, tableName, items, "replace");
        const detail = result.errors.map((entry) => `#${entry.index + 1}: ${entry.message}`).join(" ");
        flash(`Imported ${result.imported}.${result.failed ? ` Failed ${result.failed}. ${detail}` : ""}`);
        await load(request, true);
      },
    });
  }

  const attributes = knownAttributes(description, page.items);
  const columns = columnsFor(page.items, keyNames);
  const selectedItems = page.items.filter((item) => selected.has(itemKeyId(item, keyNames)));

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">DynamoDB</div>
        <div className="crumb">{connection ? connection.name : "No connection"}{tableName ? ` / ${tableName}` : ""}</div>
        <span className="spacer" />
        <button className="btn" onClick={() => void refreshTables()} disabled={!connectionId || loading}>Refresh</button>
      </header>
      <Sidebar
        connections={connections}
        connectionId={connectionId}
        tables={tables}
        tableName={tableName}
        filter={tableFilter}
        onFilter={setTableFilter}
        onSelectConnection={(id) => {
          pendingTable.current = undefined;
          setTableName(undefined);
          setPage(EMPTY_PAGE);
          setConnectionId(id);
        }}
        onSelectTable={setTableName}
        onAddConnection={() => setConnectionDialog({ presetLocal: connections.length === 0 })}
        onEditConnection={(item) => setConnectionDialog({ connection: item })}
        onDeleteConnection={(item) => setConfirm({
          title: "Delete connection",
          body: `Remove “${item.name}” from this client? The DynamoDB tables stay where they are.`,
          confirmLabel: "Delete",
          danger: true,
          run: async () => {
            await api.deleteConnection(item.id);
            if (connectionId === item.id) setConnectionId(undefined);
            await refreshConnections();
          },
        })}
        onCreateTable={() => setCreatingTable(true)}
        onDeleteTable={(name) => { setDeleteTableText(""); setTableToDelete(name); }}
        onRefresh={() => void refreshTables()}
      />
      <main className="main">
        <div className={loading ? "progress" : "progress idle"} />
        {!connectionId ? (
          <div className="empty">
            <h2>Connect to DynamoDB</h2>
            <p>Use DynamoDB Local, an AWS profile, access keys, or the same credential chain as the AWS CLI. Then browse, query, edit, and search items.</p>
            <button className="btn btn-primary" onClick={() => setConnectionDialog({ presetLocal: true })}>Add DynamoDB Local</button>
          </div>
        ) : !tableName ? (
          <div className="empty">
            <h2>{tables.length === 0 ? "No tables yet" : "Choose a table"}</h2>
            <p>{tables.length === 0 ? "Create a table with a partition key, then add items." : "Pick a table in the sidebar to load its items."}</p>
            <button className="btn btn-primary" onClick={() => setCreatingTable(true)}>Create table</button>
          </div>
        ) : (
          <>
            <QueryBar
              key={`${connectionId}:${tableName}`}
              description={description}
              attributes={attributes}
              busy={loading}
              onRun={(next) => void load(next, true)}
              onCreate={() => setEditor({ mode: "create", item: blankItem(description) })}
              onPartiQL={() => setPartiql(true)}
              onImport={() => void importItems()}
              onExport={() => void exportItems()}
              selectedCount={selectedItems.length}
              onDeleteSelected={() => setConfirm({
                title: "Delete items",
                body: `Delete ${selectedItems.length} selected items from ${tableName}?`,
                confirmLabel: "Delete",
                danger: true,
                run: () => deleteItems(selectedItems),
              })}
            />
            {description ? (
              <div className="meta">
                <span>{description.keys.map((key) => <span key={key.name}><b>{key.role === "HASH" ? "PK" : "SK"}</b> {key.name} ({key.type}) </span>)}</span>
                <span>{description.status ?? ""}</span>
                <span>{description.billingMode === "PAY_PER_REQUEST" ? "On-demand" : description.billingMode ?? ""}</span>
                {description.itemCount !== undefined ? <span>~{description.itemCount} items</span> : null}
                {description.sizeBytes !== undefined ? <span>{formatBytes(description.sizeBytes)}</span> : null}
                {description.indexes.length > 0 ? <span>{description.indexes.map((index) => index.name).join(", ")}</span> : null}
                <button className="btn" onClick={() => setDefinitionOpen(true)}>Definition</button>
              </div>
            ) : null}
            {page.items.length === 0 && !loading ? (
              <div className="empty">
                <h2>{request.kind === "scan" ? "No items" : "No matches"}</h2>
                <p>
                  {page.lastEvaluatedKey
                    ? "This segment had no matches. Keep scanning to read further into the table."
                    : "Create an item, or change the query. Text search scans string attributes and uses read capacity."}
                </p>
                {page.lastEvaluatedKey ? <button className="btn" onClick={() => void load(request, false, page.lastEvaluatedKey)}>Keep scanning</button> : (
                  <button className="btn btn-primary" onClick={() => setEditor({ mode: "create", item: blankItem(description) })}>New item</button>
                )}
              </div>
            ) : (
              <DataGrid
                items={page.items}
                columns={columns}
                keys={description?.keys ?? []}
                selected={selected}
                onToggle={(id) => setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })}
                onToggleAll={() => {
                  const ids = page.items.map((item) => itemKeyId(item, keyNames));
                  const all = ids.every((id) => selected.has(id));
                  setSelected(all ? new Set() : new Set(ids));
                }}
                onOpen={(item) => setEditor({ mode: "edit", item })}
                onCopy={(item) => void copyItem(item)}
                onDelete={(item) => setConfirm({
                  title: "Delete item",
                  body: "Delete this item? This cannot be undone.",
                  confirmLabel: "Delete",
                  danger: true,
                  run: () => deleteItems([item]),
                })}
              />
            )}
            {page.items.length > 0 && page.lastEvaluatedKey ? (
              <div className="pager">
                <button className="btn" disabled={loading} onClick={() => void load(request, false, page.lastEvaluatedKey)}>Load more</button>
              </div>
            ) : null}
          </>
        )}
        {editor && description ? (
          <ItemDrawer
            mode={editor.mode}
            item={editor.item}
            keyNames={keyNames}
            busy={loading}
            onClose={() => setEditor(undefined)}
            onSave={saveItem}
            onDelete={editor.mode === "edit" ? () => setConfirm({
              title: "Delete item",
              body: "Delete this item? This cannot be undone.",
              confirmLabel: "Delete",
              danger: true,
              run: () => deleteItems([editor.item]),
            }) : undefined}
            onDuplicate={editor.mode === "edit" ? (item) => setEditor({ mode: "create", item }) : undefined}
          />
        ) : null}
      </main>
      <footer className="statusbar">
        {error ? <span className="error">{error}</span> : notice ? <span className="ok">{notice}</span> : <span>{tableName ? `${page.items.length} shown` : "Ready"}</span>}
        <span className="spacer" />
        {page.scannedCount ? <span>scanned {page.scannedCount}</span> : null}
        {page.capacityUnits ? <span>{page.capacityUnits} RCU</span> : null}
        {page.lastEvaluatedKey ? <span>more available</span> : null}
      </footer>

      {connectionDialog ? (
        <ConnectionDialog
          initial={connectionDialog.connection}
          presetLocal={connectionDialog.presetLocal}
          profiles={profiles}
          encryption={info.encryption}
          onClose={() => setConnectionDialog(undefined)}
          onTest={async (input) => {
            const result = await api.testConnection(input);
            return `Connected. ${result.tableCount} table${result.tableCount === 1 ? "" : "s"}.`;
          }}
          onSave={async (input) => {
            const saved = await api.saveConnection(input);
            await refreshConnections();
            setConnectionId(saved.id);
            flash("Connection saved.");
          }}
        />
      ) : null}
      {creatingTable && connectionId ? (
        <CreateTableDialog
          busy={loading}
          onClose={() => setCreatingTable(false)}
          onCreate={async (input) => {
            const created = await api.createTable(connectionId, input);
            setCreatingTable(false);
            const names = await api.listTables(connectionId);
            setTables(names);
            setTableName(created.name);
            flash(`Created ${created.name}.`);
          }}
        />
      ) : null}
      {definitionOpen && description && connectionId ? (
        <TableDefinitionDialog
          description={description}
          busy={loading}
          onClose={() => setDefinitionOpen(false)}
          onCreateIndex={async (input) => {
            const described = await api.createIndex(connectionId, input);
            setDescription(described);
            const created = described.indexes.find((index) => index.name === input.indexName.trim());
            flash(created?.status === "CREATING" ? `${input.indexName.trim()} is creating.` : `Added ${input.indexName.trim()}.`);
          }}
        />
      ) : null}
      {partiql && connectionId ? (
        <PartiQLDialog
          tableName={tableName}
          busy={loading}
          onClose={() => setPartiql(false)}
          onRun={(statement, parameters, nextToken) => api.execute(connectionId, statement, parameters, nextToken)}
        />
      ) : null}
      {tableToDelete && connectionId ? (
        <DeleteTablePrompt
          tableName={tableToDelete}
          text={deleteTableText}
          onText={setDeleteTableText}
          busy={loading}
          onClose={() => setTableToDelete(undefined)}
          onConfirm={async () => {
            const removed = tableToDelete;
            await api.deleteTable(connectionId, removed);
            setTableToDelete(undefined);
            if (tableName === removed) setTableName(undefined);
            setTables(await api.listTables(connectionId));
            flash(`Deleted ${removed}.`);
          }}
        />
      ) : null}
      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          busy={loading}
          onClose={() => setConfirm(undefined)}
          onConfirm={() => {
            void (async () => {
              try {
                await confirm.run();
                setConfirm(undefined);
              } catch (err) {
                setConfirm(undefined);
                setError(err instanceof Error ? err.message : String(err));
              }
            })();
          }}
        />
      ) : null}
    </div>
  );
}

function DeleteTablePrompt(props: {
  tableName: string;
  text: string;
  busy: boolean;
  onText: (value: string) => void;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState<string>();
  return (
    <Dialog
      title="Delete table"
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>Cancel</button>
          <button
            className="btn btn-danger"
            disabled={props.busy || props.text !== props.tableName}
            onClick={() => {
              void props.onConfirm().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
            }}
          >
            Delete table
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>This permanently deletes <b>{props.tableName}</b> and every item in it.</p>
      <label className="field">
        <span>Type the table name</span>
        <input value={props.text} onChange={(event) => props.onText(event.target.value)} />
      </label>
      {error ? <div className="banner error">{error}</div> : null}
    </Dialog>
  );
}

