import { editableFromAwsJson, extractKey, sameKey } from "@dynamodb-client/protocol";
import { useMemo, useState, type KeyboardEvent } from "react";

export function ItemDrawer(props: {
  mode: "create" | "edit";
  item: Record<string, unknown>;
  keyNames: string[];
  busy: boolean;
  onClose: () => void;
  onSave: (item: Record<string, unknown>, deleteOriginal: boolean) => Promise<void>;
  onDelete?: () => void;
  onDuplicate?: (item: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(props.item, null, 2));
  const [error, setError] = useState<string>();
  const [deleteOriginal, setDeleteOriginal] = useState(true);

  const parsed = useMemo(() => {
    try {
      const value = JSON.parse(text) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Item must be a JSON object." };
      return { value: value as Record<string, unknown> };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Invalid JSON." };
    }
  }, [text]);

  const keyChanged = useMemo(() => {
    if (props.mode !== "edit" || !parsed.value) return false;
    try {
      const original = extractKey(props.item, props.keyNames);
      const next = extractKey(parsed.value, props.keyNames);
      return !sameKey(original, next, props.keyNames);
    } catch {
      return false;
    }
  }, [parsed.value, props.item, props.keyNames, props.mode]);

  async function save() {
    if (!parsed.value) {
      setError(parsed.error);
      return;
    }
    setError(undefined);
    try {
      await props.onSave(parsed.value, keyChanged && deleteOriginal);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function format() {
    if (!parsed.value) {
      setError(parsed.error);
      return;
    }
    setText(JSON.stringify(parsed.value, null, 2));
    setError(undefined);
  }

  function convertAws() {
    try {
      const value = JSON.parse(text) as unknown;
      setText(JSON.stringify(editableFromAwsJson(value), null, 2));
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Tab") {
      event.preventDefault();
      const el = event.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = `${text.slice(0, start)}  ${text.slice(end)}`;
      setText(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  }

  return (
    <div className="drawer-backdrop">
      <dialog open className="drawer" aria-modal="true" aria-label={props.mode === "create" ? "New item" : "Edit item"}>
        <header>
          <h2>{props.mode === "create" ? "New item" : "Edit item"}</h2>
          <span className="spacer" />
          <button className="btn" onClick={format}>Format</button>
          <button className="btn" onClick={convertAws}>Convert AWS JSON</button>
          <button className="icon-btn" aria-label="Close" onClick={props.onClose}>×</button>
        </header>
        <div className="body">
          <p className="muted" style={{ margin: 0 }}>
            Saves the whole item. Numbers that need exact precision use {`{ "$n": "..." }`} . String sets use {`{ "$ss": ["a"] }`} . Ctrl+Enter saves.
          </p>
          <textarea className="editor" value={text} spellCheck={false} onChange={(event) => setText(event.target.value)} onKeyDown={onKeyDown} aria-label="Item JSON" />
          {keyChanged ? (
            <label className="check">
              <input type="checkbox" checked={deleteOriginal} onChange={(event) => setDeleteOriginal(event.target.checked)} />
              Key changed. Delete the original item after the new one is saved.
            </label>
          ) : null}
          {error || parsed.error ? <div className="banner error">{error || parsed.error}</div> : null}
        </div>
        <footer>
          {props.onDuplicate && parsed.value ? <button className="btn" onClick={() => props.onDuplicate?.(parsed.value!)}>Duplicate</button> : null}
          {props.onDelete ? <button className="btn btn-danger" onClick={props.onDelete} disabled={props.busy}>Delete</button> : null}
          <span className="spacer" />
          <button className="btn" onClick={props.onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={props.busy || !parsed.value}>Save item</button>
        </footer>
      </dialog>
      <button type="button" className="backdrop-dismiss" aria-label="Close dialog" tabIndex={-1} onClick={props.onClose} />
    </div>
  );
}
