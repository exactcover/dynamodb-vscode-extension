import type { CreateTableInput, KeyAttributeType } from "@dynamodb-client/protocol";
import { useState } from "react";
import { Dialog } from "./Dialog";

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
  const [error, setError] = useState<string>();

  async function create() {
    setError(undefined);
    try {
      await props.onCreate({
        tableName,
        partitionKey: { name: partitionName, type: partitionType },
        sortKey: withSort ? { name: sortName, type: sortType } : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Dialog
      title="Create table"
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={props.busy} onClick={() => void create()}>Create</button>
        </>
      }
    >
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>On-demand billing. A global secondary index can be added later from Definition. A local secondary index has to be created with the table in AWS.</p>
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
        {error ? <div className="banner error">{error}</div> : null}
      </div>
    </Dialog>
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
