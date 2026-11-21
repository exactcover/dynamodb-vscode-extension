import type { PublicConnection } from "@dynamodb-client/protocol";
import { modeLabel } from "../format";

export function Sidebar(props: {
  connections: PublicConnection[];
  connectionId?: string;
  tables: string[];
  tableName?: string;
  filter: string;
  onFilter: (value: string) => void;
  onSelectConnection: (id: string) => void;
  onSelectTable: (name: string) => void;
  onAddConnection: () => void;
  onEditConnection: (connection: PublicConnection) => void;
  onDeleteConnection: (connection: PublicConnection) => void;
  onCreateTable: () => void;
  onRefresh: () => void;
}) {
  const filtered = props.tables.filter((name) => name.toLowerCase().includes(props.filter.trim().toLowerCase()));
  return (
    <aside className="sidebar">
      <div className="side-head">
        Connections
        <span className="spacer" />
        <button className="icon-btn" aria-label="Add connection" title="Add connection" onClick={props.onAddConnection}>+</button>
      </div>
      <div className="conn-list">
        {props.connections.length === 0 ? <div className="muted" style={{ padding: "4px 8px" }}>No connections yet.</div> : null}
        {props.connections.map((connection) => (
          <div className="nav-row" key={connection.id}>
            <button
              className={connection.id === props.connectionId ? "nav-item active" : "nav-item"}
              onClick={() => props.onSelectConnection(connection.id)}
            >
              <strong>{connection.name}</strong>
              <span>{modeLabel(connection.mode)} · {connection.region}</span>
            </button>
            <button className="icon-btn" aria-label={`Edit ${connection.name}`} title="Edit" onClick={() => props.onEditConnection(connection)}>✎</button>
            <button className="icon-btn" aria-label={`Delete ${connection.name}`} title="Delete" onClick={() => props.onDeleteConnection(connection)}>×</button>
          </div>
        ))}
      </div>
      <div className="block-head">
        Tables
        <span className="spacer" />
        <button className="icon-btn" aria-label="Refresh tables" title="Refresh" onClick={props.onRefresh} disabled={!props.connectionId}>↻</button>
        <button className="icon-btn" aria-label="Create table" title="Create table" onClick={props.onCreateTable} disabled={!props.connectionId}>+</button>
      </div>
      <input
        className="filter"
        placeholder="Filter tables"
        value={props.filter}
        onChange={(event) => props.onFilter(event.target.value)}
        aria-label="Filter tables"
      />
      <div className="table-list">
        {props.connectionId && filtered.length === 0 ? <div className="muted" style={{ padding: "4px 8px" }}>No tables.</div> : null}
        {filtered.map((name) => (
          <button
            key={name}
            className={name === props.tableName ? "nav-item active" : "nav-item"}
            onClick={() => props.onSelectTable(name)}
          >
            <strong>{name}</strong>
          </button>
        ))}
      </div>
    </aside>
  );
}
