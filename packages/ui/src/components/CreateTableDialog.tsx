import type { CreateTableInput, GlobalIndexInput, KeyAttributeType, LocalIndexInput } from "@dynamodb-client/protocol";
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

interface GlobalIndexDraft {
  id: string;
  indexName: string;
  partitionName: string;
  partitionType: KeyAttributeType;
  withSort: boolean;
  sortName: string;
  sortType: KeyAttributeType;
  projection: Projection;
  nonKey: string;
}

const maxLocalIndexes = 5;
const maxGlobalIndexes = 20;

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
  const [globalIndexes, setGlobalIndexes] = useState<GlobalIndexDraft[]>([]);
  const [error, setError] = useState<string>();

  function setSortEnabled(on: boolean) {
    setWithSort(on);
    if (!on) setIndexes([]);
  }

  function updateIndex(id: string, patch: Partial<LocalIndexDraft>) {
    setIndexes((current) => current.map((index) => (index.id === id ? { ...index, ...patch } : index)));
  }

  function updateGlobal(id: string, patch: Partial<GlobalIndexDraft>) {
    setGlobalIndexes((current) => current.map((index) => (index.id === id ? { ...index, ...patch } : index)));
  }

  async function create() {
    setError(undefined);
    const localIndexes = indexes
      .filter((index) => index.indexName.trim() || index.sortName.trim() || index.nonKey.trim())
      .map((index) => ({
        indexName: index.indexName.trim(),
        sortKey: { name: index.sortName.trim(), type: index.sortType },
        projection: index.projection,
        nonKeyAttributes: namedAttributes(index),
      }));
    const globals: GlobalIndexInput[] = globalIndexes
      .filter((index) => index.indexName.trim() || index.partitionName.trim() || index.sortName.trim() || index.nonKey.trim())
      .map((index) => ({
        indexName: index.indexName.trim(),
        partitionKey: { name: index.partitionName.trim(), type: index.partitionType },
        sortKey: index.withSort ? { name: index.sortName.trim(), type: index.sortType } : undefined,
        projection: index.projection,
        nonKeyAttributes: namedAttributes(index),
      }));
    try {
      await props.onCreate({
        tableName,
        partitionKey: { name: partitionName, type: partitionType },
        sortKey: withSort ? { name: sortName, type: sortType } : undefined,
        localIndexes: localIndexes.length > 0 ? localIndexes : undefined,
        globalIndexes: globals.length > 0 ? globals : undefined,
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
          On-demand billing. The table has one partition key. Each global index adds its own key. A local index shares the table partition key, so the table needs a sort key.
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
                <ProjectionFields
                  projection={index.projection}
                  nonKey={index.nonKey}
                  onProjection={(projection) => updateIndex(index.id, { projection })}
                  onNonKey={(nonKey) => updateIndex(index.id, { nonKey })}
                />
              </div>
            ))}
            <div>
              <button
                className="btn"
                type="button"
                disabled={indexes.length >= maxLocalIndexes}
                onClick={() => setIndexes((current) => [...current, blankLocalIndex()])}
              >
                Add local index
              </button>
            </div>
          </>
        ) : null}
        <h3>Global indexes</h3>
        <p className="muted" style={{ margin: 0 }}>
          Up to twenty. Use one for each extra key, such as email. You can also add these later from Definition.
        </p>
        {globalIndexes.map((index) => (
          <div className="index-draft" key={index.id}>
            <div className="index-draft-head">
              <strong>Global index</strong>
              <button className="btn" type="button" onClick={() => setGlobalIndexes((current) => current.filter((item) => item.id !== index.id))}>Remove</button>
            </div>
            <label className="field">
              <span>Index name</span>
              <input value={index.indexName} onChange={(event) => updateGlobal(index.id, { indexName: event.target.value })} />
            </label>
            <div className="inline">
              <label className="field grow-field">
                <span>Partition key</span>
                <input value={index.partitionName} onChange={(event) => updateGlobal(index.id, { partitionName: event.target.value })} />
              </label>
              <TypeSelect value={index.partitionType} onChange={(partitionType) => updateGlobal(index.id, { partitionType })} />
            </div>
            <label className="check">
              <input type="checkbox" checked={index.withSort} onChange={(event) => updateGlobal(index.id, { withSort: event.target.checked })} />
              Sort key
            </label>
            {index.withSort ? (
              <div className="inline">
                <label className="field grow-field">
                  <span>Sort key</span>
                  <input value={index.sortName} onChange={(event) => updateGlobal(index.id, { sortName: event.target.value })} />
                </label>
                <TypeSelect value={index.sortType} onChange={(sortType) => updateGlobal(index.id, { sortType })} />
              </div>
            ) : null}
            <ProjectionFields
              projection={index.projection}
              nonKey={index.nonKey}
              onProjection={(projection) => updateGlobal(index.id, { projection })}
              onNonKey={(nonKey) => updateGlobal(index.id, { nonKey })}
            />
          </div>
        ))}
        <div>
          <button
            className="btn"
            type="button"
            disabled={globalIndexes.length >= maxGlobalIndexes}
            onClick={() => setGlobalIndexes((current) => [...current, blankGlobalIndex()])}
          >
            Add global index
          </button>
        </div>
        {error ? <div className="banner error">{error}</div> : null}
      </div>
    </Dialog>
  );
}

function namedAttributes(index: { projection: Projection; nonKey: string }): string[] | undefined {
  if (index.projection !== "INCLUDE") return undefined;
  const names = index.nonKey.split(",").map((name) => name.trim()).filter(Boolean);
  return names.length > 0 ? names : undefined;
}

function blankLocalIndex(): LocalIndexDraft {
  return {
    id: crypto.randomUUID(),
    indexName: "",
    sortName: "",
    sortType: "S",
    projection: "ALL",
    nonKey: "",
  };
}

function blankGlobalIndex(): GlobalIndexDraft {
  return {
    id: crypto.randomUUID(),
    indexName: "",
    partitionName: "",
    partitionType: "S",
    withSort: false,
    sortName: "",
    sortType: "S",
    projection: "ALL",
    nonKey: "",
  };
}

function ProjectionFields(props: {
  projection: Projection;
  nonKey: string;
  onProjection: (value: Projection) => void;
  onNonKey: (value: string) => void;
}) {
  return (
    <>
      <label className="field">
        <span>Projection</span>
        <select value={props.projection} onChange={(event) => props.onProjection(event.target.value as Projection)}>
          <option value="ALL">All attributes</option>
          <option value="KEYS_ONLY">Keys only</option>
          <option value="INCLUDE">Include named attributes</option>
        </select>
      </label>
      {props.projection === "INCLUDE" ? (
        <label className="field">
          <span>Attributes to include</span>
          <input value={props.nonKey} placeholder="email, name" onChange={(event) => props.onNonKey(event.target.value)} />
        </label>
      ) : null}
    </>
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
