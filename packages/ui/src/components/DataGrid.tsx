import type { KeySchema } from "@dynamodb-client/protocol";
import { itemKeyId, previewValue } from "../format";

export function DataGrid(props: {
  items: Record<string, unknown>[];
  columns: string[];
  keys: KeySchema[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (item: Record<string, unknown>) => void;
  onCopy: (item: Record<string, unknown>) => void;
  onDelete: (item: Record<string, unknown>) => void;
}) {
  const keyNames = props.keys.map((key) => key.name);
  const roles = new Map(props.keys.map((key) => [key.name, key.role === "HASH" ? "PK" : "SK"]));
  const ids = props.items.map((item) => itemKeyId(item, keyNames));
  const allSelected = ids.length > 0 && ids.every((id) => props.selected.has(id));
  if (props.columns.length === 0) return null;
  return (
    <div className="grid-wrap">
      <table className="data">
        <thead>
          <tr>
            <th className="check-col">
              <input type="checkbox" checked={allSelected} onChange={props.onToggleAll} aria-label="Select all loaded rows" />
            </th>
            {props.columns.map((column) => (
              <th key={column} className={roles.has(column) ? "key" : undefined}>
                {column}
                {roles.has(column) ? <span className="badge">{roles.get(column)}</span> : null}
              </th>
            ))}
            <th aria-label="Actions"></th>
          </tr>
        </thead>
        <tbody>
          {props.items.map((item, index) => {
            const id = ids[index] ?? String(index);
            return (
              <tr key={id} className={props.selected.has(id) ? "selected" : undefined} onDoubleClick={() => props.onOpen(item)}>
                <td className="check-col">
                  <input type="checkbox" checked={props.selected.has(id)} onChange={() => props.onToggle(id)} aria-label="Select row" />
                </td>
                {props.columns.map((column) => {
                  const text = previewValue(item[column]);
                  return (
                    <td key={column} className={roles.has(column) ? "key" : undefined} title={text}>
                      {text}
                    </td>
                  );
                })}
                <td>
                  <div className="item-actions">
                    <button className="icon-btn" title="Edit" aria-label="Edit item" onClick={() => props.onOpen(item)}>✎</button>
                    <button className="icon-btn" title="Copy JSON" aria-label="Copy item JSON" onClick={() => props.onCopy(item)}>⧉</button>
                    <button className="icon-btn" title="Delete" aria-label="Delete item" onClick={() => props.onDelete(item)}>×</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
