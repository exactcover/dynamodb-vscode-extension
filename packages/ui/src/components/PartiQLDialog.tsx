import type { StatementResult } from "@dynamodb-client/protocol";
import { useState } from "react";
import { previewValue } from "../format";
import { Dialog } from "./Dialog";

export function PartiQLDialog(props: {
  tableName?: string;
  busy: boolean;
  onClose: () => void;
  onRun: (statement: string, parameters: unknown[] | undefined, nextToken?: string) => Promise<StatementResult>;
}) {
  const sample = props.tableName ? `SELECT * FROM "${props.tableName}"` : "SELECT * FROM \"TableName\"";
  const [statement, setStatement] = useState(sample);
  const [parameters, setParameters] = useState("");
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<StatementResult>();

  async function run(nextToken?: string) {
    setError(undefined);
    let parsed: unknown[] | undefined;
    if (parameters.trim()) {
      try {
        const value = JSON.parse(parameters) as unknown;
        if (!Array.isArray(value)) throw new Error("Parameters must be a JSON array.");
        parsed = value;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
    }
    const mutating = /^\s*(delete|update|insert)\b/i.test(statement);
    if (mutating && !window.confirm("This statement writes to DynamoDB. Run it?")) return;
    try {
      const page = await props.onRun(statement, parsed, nextToken);
      setResult(nextToken && result ? { ...page, items: [...result.items, ...page.items] } : page);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const columns = [...new Set((result?.items ?? []).flatMap((item) => Object.keys(item)))];

  return (
    <Dialog
      title="PartiQL"
      wide
      onClose={props.onClose}
      footer={
        <>
          {result?.nextToken ? <button className="btn" disabled={props.busy} onClick={() => void run(result.nextToken)}>Load more</button> : null}
          <span className="spacer" />
          <button className="btn" onClick={props.onClose}>Close</button>
          <button className="btn btn-primary" disabled={props.busy} onClick={() => void run()}>Run</button>
        </>
      }
    >
      <label className="field">
        <span>Statement</span>
        <textarea className="editor" style={{ minHeight: 120 }} value={statement} spellCheck={false} onChange={(event) => setStatement(event.target.value)} />
      </label>
      <label className="field">
        <span>Parameters JSON array, optional</span>
        <input value={parameters} placeholder='["ada"]' onChange={(event) => setParameters(event.target.value)} />
      </label>
      <p className="muted" style={{ margin: 0 }}>
        Example: SELECT * FROM "{props.tableName ?? "Users"}" WHERE contains("email", ?)
      </p>
      {error ? <div className="banner error">{error}</div> : null}
      {result ? (
        <div className="results">
          {result.items.length === 0 ? <div className="muted" style={{ padding: 10 }}>No items returned.</div> : (
            <table className="data">
              <thead>
                <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
              </thead>
              <tbody>
                {result.items.map((item, index) => (
                  <tr key={index}>{columns.map((column) => <td key={column} title={previewValue(item[column])}>{previewValue(item[column])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
