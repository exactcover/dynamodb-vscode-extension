import type { CreateIndexInput, KeyAttributeType, KeySchema, TableDescription } from "@dynamodb-client/protocol";
import { useState } from "react";
import { formatBytes } from "../format";
import { Dialog } from "./Dialog";

export function TableDefinitionDialog(props: {
  description: TableDescription;
  busy: boolean;
  onClose: () => void;
  onCreateIndex: (input: CreateIndexInput) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [indexName, setIndexName] = useState("");
  const [partitionName, setPartitionName] = useState("");
  const [partitionType, setPartitionType] = useState<KeyAttributeType>("S");
  const [withSort, setWithSort] = useState(false);
  const [sortName, setSortName] = useState("");
  const [sortType, setSortType] = useState<KeyAttributeType>("S");
  const [projection, setProjection] = useState<CreateIndexInput["projection"]>("ALL");
  const [nonKey, setNonKey] = useState("");
  const [readCapacity, setReadCapacity] = useState("5");
  const [writeCapacity, setWriteCapacity] = useState("5");
  const [error, setError] = useState<string>();
  const table = props.description;
  const provisioned = table.billingMode === "PROVISIONED";

  async function create() {
    setError(undefined);
    try {
      await props.onCreateIndex({
        tableName: table.name,
        indexName,
        partitionKey: { name: partitionName, type: partitionType },
        sortKey: withSort ? { name: sortName, type: sortType } : undefined,
        projection,
        nonKeyAttributes: projection === "INCLUDE" ? nonKey.split(",").map((name) => name.trim()).filter(Boolean) : undefined,
        readCapacity: provisioned ? Number(readCapacity) : undefined,
        writeCapacity: provisioned ? Number(writeCapacity) : undefined,
      });
      setAdding(false);
      setIndexName("");
      setPartitionName("");
      setSortName("");
      setWithSort(false);
      setNonKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Dialog
      title={table.name}
      wide
      onClose={props.onClose}
      footer={
        adding ? (
          <>
            <button className="btn" onClick={() => { setAdding(false); setError(undefined); }}>Back</button>
            <button className="btn btn-primary" disabled={props.busy} onClick={() => void create()}>Add index</button>
          </>
        ) : (
          <>
            <button className="btn" onClick={props.onClose}>Close</button>
            <button className="btn btn-primary" onClick={() => setAdding(true)}>Add index</button>
          </>
        )
      }
    >
      <dl className="facts">
        <dt>Status</dt>
        <dd>{table.status ?? "Unknown"}</dd>
        <dt>Billing</dt>
        <dd>{table.billingMode === "PAY_PER_REQUEST" ? "On-demand" : table.billingMode ?? "Unknown"}</dd>
        <dt>Items</dt>
        <dd>{table.itemCount === undefined ? "Unknown" : `about ${table.itemCount}`}</dd>
        <dt>Size</dt>
        <dd>{table.sizeBytes === undefined ? "Unknown" : formatBytes(table.sizeBytes)}</dd>
        {table.createdAt ? (
          <>
            <dt>Created</dt>
            <dd>{new Date(table.createdAt).toLocaleString()}</dd>
          </>
        ) : null}
      </dl>
      <section>
        <h3>Primary key</h3>
        <KeyList keys={table.keys} />
      </section>
      <section>
        <h3>Indexes</h3>
        {table.indexes.length === 0 ? <p className="muted">No indexes.</p> : (
          <div className="stack">
            {table.indexes.map((index) => (
              <div key={index.name}>
                <strong>{index.name}</strong>
                <span className="muted"> {index.type}{index.status ? ` · ${index.status}` : ""}</span>
                <KeyList keys={index.keys} />
                <div className="muted">{projectionLabel(index.projection)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
      {adding ? (
        <section className="stack">
          <h3>New global secondary index</h3>
          <p className="muted">A global index can also be chosen in Create table. This adds one to the existing table. Items already stored are copied into it, which can take a while. A local secondary index can only be chosen while creating the table.</p>
          <label className="field">
            <span>Index name</span>
            <input value={indexName} onChange={(event) => setIndexName(event.target.value)} />
          </label>
          <div className="inline">
            <label className="field grow-field">
              <span>Partition key</span>
              <input value={partitionName} onChange={(event) => setPartitionName(event.target.value)} />
            </label>
            <TypeSelect value={partitionType} onChange={setPartitionType} />
          </div>
          <label className="check">
            <input type="checkbox" checked={withSort} onChange={(event) => setWithSort(event.target.checked)} />
            Sort key
          </label>
          {withSort ? (
            <div className="inline">
              <label className="field grow-field">
                <span>Sort key</span>
                <input value={sortName} onChange={(event) => setSortName(event.target.value)} />
              </label>
              <TypeSelect value={sortType} onChange={setSortType} />
            </div>
          ) : null}
          <label className="field">
            <span>Projection</span>
            <select value={projection} onChange={(event) => setProjection(event.target.value as CreateIndexInput["projection"])}>
              <option value="ALL">All attributes</option>
              <option value="KEYS_ONLY">Keys only</option>
              <option value="INCLUDE">Include named attributes</option>
            </select>
          </label>
          {projection === "INCLUDE" ? (
            <label className="field">
              <span>Attributes to include</span>
              <input value={nonKey} placeholder="email, name" onChange={(event) => setNonKey(event.target.value)} />
            </label>
          ) : null}
          {provisioned ? (
            <div className="inline">
              <label className="field">
                <span>Read capacity</span>
                <input value={readCapacity} onChange={(event) => setReadCapacity(event.target.value)} />
              </label>
              <label className="field">
                <span>Write capacity</span>
                <input value={writeCapacity} onChange={(event) => setWriteCapacity(event.target.value)} />
              </label>
            </div>
          ) : null}
        </section>
      ) : null}
      {error ? <div className="banner error">{error}</div> : null}
    </Dialog>
  );
}

function KeyList(props: { keys: KeySchema[] }) {
  return (
    <ul className="key-list">
      {props.keys.map((key) => (
        <li key={`${key.role}-${key.name}`}>
          <b>{key.role === "HASH" ? "Partition" : "Sort"}</b> {key.name} · {typeLabel(key.type)}
        </li>
      ))}
    </ul>
  );
}

function TypeSelect(props: { value: KeyAttributeType; onChange: (value: KeyAttributeType) => void }) {
  return (
    <label className="field">
      <span>Type</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value as KeyAttributeType)}>
        <option value="S">String</option>
        <option value="N">Number</option>
        <option value="B">Binary</option>
      </select>
    </label>
  );
}

function typeLabel(type: KeyAttributeType): string {
  if (type === "S") return "String";
  if (type === "N") return "Number";
  return "Binary";
}

function projectionLabel(projection: TableDescription["indexes"][number]["projection"]): string {
  if (projection === "KEYS_ONLY") return "Projects keys only";
  if (projection === "INCLUDE") return "Projects keys and named attributes";
  if (projection === "ALL") return "Projects all attributes";
  return "Projection not reported";
}
