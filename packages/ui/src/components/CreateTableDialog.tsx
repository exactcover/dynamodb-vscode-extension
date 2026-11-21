import type { CreateTableInput, KeyAttributeType, LocalIndexInput } from "@dynamodb-client/protocol";
import { useState } from "react";
import { Dialog } from "./Dialog";

type Projection = LocalIndexInput["projection"];

interface LocalIndexDraft {
  id: string;
  indexName: string;
  sortName: string;
  sortType: KeyAttributeType;
  projection: Projection;
  nonKey: string;
}

const maxLocalIndexes = 5;

export function CreateTableDialog(props: {
  busy: boolean;
  onClose: () => void;
  onCreate: (input: CreateTableInput) => Promise<void>;
}) {
  const [tableName, setTableName] = useState("");
  const [partitionName, setPartitionName] = useState("pk");
  const [partitionType, setPartitionType] = useState<KeyAttributeType>("S");
  const [withSort, setWithSort] = useState(false);
  const [sortName, setSortName] = useState("sk");
  const [sortType, setSortType] = useState<KeyAttributeType>("S");
  const [indexes, setIndexes] = useState<LocalIndexDraft[]>([]);
  const [error, setError] = useState<string>();

  function setSortEnabled(on: boolean) {
    setWithSort(on);
    if (!on) setIndexes([]);
  }

  function updateIndex(id: string, patch: Partial<LocalIndexDraft>) {
    setIndexes((current) => current.map((index) => (index.id === id ? { ...index, ...patch } : index)));
  }

  async function create() {
    setError(undefined);
    const localIndexes = indexes
      .filter((index) => index.indexName.trim() || index.sortName.trim() || index.nonKey.trim())
      .map((index) => ({
        indexName: index.indexName.trim(),
        sortKey: { name: index.sortName.trim(), type: index.sortType },
        projection: index.projection,
        nonKeyAttributes: index.projection === "INCLUDE"
          ? index.nonKey.split(",").map((name) => name.trim()).filter(Boolean)
          : undefined,
      }));
    try {
      await props.onCreate({
        tableName,
        partitionKey: { name: partitionName, type: partitionType },
        sortKey: withSort ? { name: sortName, type: sortType } : undefined,
        localIndexes: localIndexes.length > 0 ? localIndexes : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const partitionLabel = partitionName.trim() || "the table partition key";

  return (
    <Dialog
      title="Create table"
      wide
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={props.busy} onClick={() => void create()}>Create</button>
        </>
      }
    >
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          On-demand billing. A local index shares the table partition key, so the table needs a sort key. A global secondary index can be added later from Definition.
        </p>
        <label className="field">
          <span>Table name</span>
          <input value={tableName} onChange={(event) => setTableName(event.target.value)} />
        </label>
        <div className="inline">
          <label className="field grow-field">
            <span>Partition key</span>
            <input value={partitionName} onChange={(event) => setPartitionName(event.target.value)} />
          </label>
          <TypeSelect value={partitionType} onChange={setPartitionType} />
        </div>
        <label className="check">
          <input type="checkbox" checked={withSort} onChange={(event) => setSortEnabled(event.target.checked)} />
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
        {withSort ? (
          <>
            <h3>Local indexes</h3>
            <p className="muted" style={{ margin: 0 }}>
              Up to five. Each one uses partition key {partitionLabel} and its own sort key.
            </p>
            {indexes.map((index) => (
              <div className="index-draft" key={index.id}>
                <div className="index-draft-head">
                  <strong>Local index</strong>
                  <button className="btn" type="button" onClick={() => setIndexes((current) => current.filter((item) => item.id !== index.id))}>Remove</button>
                </div>
                <label className="field">
                  <span>Index name</span>
                  <input value={index.indexName} onChange={(event) => updateIndex(index.id, { indexName: event.target.value })} />
                </label>
                <div className="inline">
                  <label className="field grow-field">
                    <span>Sort key</span>
                    <input value={index.sortName} onChange={(event) => updateIndex(index.id, { sortName: event.target.value })} />
                  </label>
                  <TypeSelect value={index.sortType} onChange={(sortType) => updateIndex(index.id, { sortType })} />
                </div>
                <label className="field">
                  <span>Projection</span>
                  <select value={index.projection} onChange={(event) => updateIndex(index.id, { projection: event.target.value as Projection })}>
                    <option value="ALL">All attributes</option>
                    <option value="KEYS_ONLY">Keys only</option>
                    <option value="INCLUDE">Include named attributes</option>
                  </select>
                </label>
                {index.projection === "INCLUDE" ? (
                  <label className="field">
                    <span>Attributes to include</span>
                    <input value={index.nonKey} placeholder="email, name" onChange={(event) => updateIndex(index.id, { nonKey: event.target.value })} />
                  </label>
                ) : null}
              </div>
            ))}
            <div>
              <button
                className="btn"
                type="button"
                disabled={indexes.length >= maxLocalIndexes}
                onClick={() => setIndexes((current) => [...current, blankIndex()])}
              >
                Add local index
              </button>
            </div>
          </>
        ) : null}
        {error ? <div className="banner error">{error}</div> : null}
      </div>
    </Dialog>
  );
}

function blankIndex(): LocalIndexDraft {
  return {
    id: crypto.randomUUID(),
    indexName: "",
    sortName: "",
    sortType: "S",
    projection: "ALL",
    nonKey: "",
  };
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
