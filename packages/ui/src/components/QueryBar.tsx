import { useState } from "react";
import type { SortOperator, TableDescription } from "@dynamodb-client/protocol";

export type PageRequest =
  | { kind: "scan"; limit: number; consistentRead: boolean; indexName?: string }
  | {
      kind: "query";
      limit: number;
      consistentRead: boolean;
      indexName?: string;
      partitionKeyValue: string;
      sortKeyOperator?: SortOperator;
      sortKeyValue?: string;
      sortKeyValue2?: string;
      scanIndexForward: boolean;
    }
  | { kind: "search"; limit: number; consistentRead: boolean; text: string; attribute?: string };

const OPERATORS: { id: SortOperator; label: string }[] = [
  { id: "eq", label: "=" },
  { id: "begins_with", label: "begins with" },
  { id: "lt", label: "<" },
  { id: "lte", label: "<=" },
  { id: "gt", label: ">" },
  { id: "gte", label: ">=" },
  { id: "between", label: "between" },
];

export function QueryBar(props: {
  description?: TableDescription;
  attributes: string[];
  busy: boolean;
  onRun: (request: PageRequest) => void;
  onCreate: () => void;
  onPartiQL: () => void;
  onImport: () => void;
  onExport: () => void;
  onDeleteTable: () => void;
}) {
  const [mode, setMode] = useState<PageRequest["kind"]>("scan");
  const [limit, setLimit] = useState(50);
  const [consistent, setConsistent] = useState(false);
  const [indexName, setIndexName] = useState("");
  const [partitionKeyValue, setPartitionKeyValue] = useState("");
  const [sortKeyOperator, setSortKeyOperator] = useState<SortOperator | "">("");
  const [sortKeyValue, setSortKeyValue] = useState("");
  const [sortKeyValue2, setSortKeyValue2] = useState("");
  const [descending, setDescending] = useState(false);
  const [text, setText] = useState("");
  const [attribute, setAttribute] = useState("");

  const index = props.description?.indexes.find((item) => item.name === indexName);
  const keys = index?.keys ?? props.description?.keys ?? [];
  const partition = keys.find((key) => key.role === "HASH");
  const sort = keys.find((key) => key.role === "RANGE");
  const gsi = index?.type === "GSI";

  function run() {
    const shared = { limit, consistentRead: gsi ? false : consistent, indexName: indexName || undefined };
    if (mode === "scan") props.onRun({ kind: "scan", ...shared });
    else if (mode === "search") props.onRun({ kind: "search", ...shared, text, attribute: attribute || undefined });
    else {
      props.onRun({
        kind: "query",
        ...shared,
        partitionKeyValue,
        sortKeyOperator: sortKeyOperator || undefined,
        sortKeyValue: sortKeyValue || undefined,
        sortKeyValue2: sortKeyValue2 || undefined,
        scanIndexForward: !descending,
      });
    }
  }

  return (
    <div className="toolbar">
      <div className="segmented" role="tablist" aria-label="Read mode">
        {([
          ["scan", "Browse"],
          ["query", "Query"],
          ["search", "Search"],
        ] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={mode === id} onClick={() => setMode(id)}>{label}</button>
        ))}
      </div>
      {props.description && props.description.indexes.length > 0 ? (
        <label className="field">
          <span>Index</span>
          <select value={indexName} onChange={(event) => setIndexName(event.target.value)} aria-label="Index">
            <option value="">Table</option>
            {props.description.indexes.map((item) => (
              <option key={item.name} value={item.name}>{item.name} ({item.type})</option>
            ))}
          </select>
        </label>
      ) : null}
      {mode === "query" ? (
        <>
          <label className="field">
            <span>Partition {partition ? `${partition.name} (${partition.type})` : "key"}</span>
            <input value={partitionKeyValue} onChange={(event) => setPartitionKeyValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") run(); }} />
          </label>
          {sort ? (
            <>
              <label className="field">
                <span>Sort {sort.name}</span>
                <select value={sortKeyOperator} onChange={(event) => setSortKeyOperator(event.target.value as SortOperator | "")}>
                  <option value="">Any</option>
                  {OPERATORS.map((op) => <option key={op.id} value={op.id}>{op.label}</option>)}
                </select>
              </label>
              {sortKeyOperator ? (
                <label className="field">
                  <span>Value</span>
                  <input value={sortKeyValue} onChange={(event) => setSortKeyValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") run(); }} />
                </label>
              ) : null}
              {sortKeyOperator === "between" ? (
                <label className="field">
                  <span>And</span>
                  <input value={sortKeyValue2} onChange={(event) => setSortKeyValue2(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") run(); }} />
                </label>
              ) : null}
              <label className="check"><input type="checkbox" checked={descending} onChange={(event) => setDescending(event.target.checked)} /> Descending</label>
            </>
          ) : null}
        </>
      ) : null}
      {mode === "search" ? (
        <>
          <label className="field grow-field">
            <span>Text</span>
            <input
              value={text}
              placeholder="Matches top-level strings. Type an attribute to narrow it."
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") run(); }}
            />
          </label>
          <label className="field">
            <span>Attribute</span>
            <input list="search-attributes" value={attribute} placeholder="Any string" onChange={(event) => setAttribute(event.target.value)} />
            <datalist id="search-attributes">
              {props.attributes.map((name) => <option key={name} value={name}>{name}</option>)}
            </datalist>
          </label>
        </>
      ) : null}
      <label className="field">
        <span>Page</span>
        <select value={limit} onChange={(event) => setLimit(Number(event.target.value))} aria-label="Page size">
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </label>
      <label className="check" title={gsi ? "Global secondary indexes are eventually consistent" : "Strongly consistent read"}>
        <input type="checkbox" checked={gsi ? false : consistent} disabled={gsi} onChange={(event) => setConsistent(event.target.checked)} />
        Consistent
      </label>
      <button className="btn btn-primary" onClick={run} disabled={props.busy || !props.description}>Run</button>
      <span className="spacer" />
      <button className="btn" onClick={props.onCreate} disabled={!props.description}>New item</button>
      <button className="btn" onClick={props.onPartiQL} disabled={!props.description}>PartiQL</button>
      <button className="btn" onClick={props.onImport} disabled={!props.description}>Import</button>
      <button className="btn" onClick={props.onExport} disabled={!props.description}>Export</button>
      <button className="btn btn-danger" onClick={props.onDeleteTable} disabled={!props.description}>Delete table</button>
    </div>
  );
}
