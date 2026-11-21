import type { ConnectionInput, ConnectionMode, PublicConnection } from "@dynamodb-client/protocol";
import { useState } from "react";
import { Dialog } from "./Dialog";

const MODES: { id: ConnectionMode; label: string }[] = [
  { id: "local", label: "DynamoDB Local" },
  { id: "profile", label: "AWS profile" },
  { id: "keys", label: "Access keys" },
  { id: "default", label: "Default credential chain" },
];

export function ConnectionDialog(props: {
  initial?: PublicConnection;
  presetLocal?: boolean;
  profiles: string[];
  encryption: boolean;
  onClose: () => void;
  onTest: (input: ConnectionInput) => Promise<string>;
  onSave: (input: ConnectionInput) => Promise<void>;
}) {
  const initial = props.initial;
  const [name, setName] = useState(initial?.name ?? (props.presetLocal ? "DynamoDB Local" : ""));
  const [mode, setMode] = useState<ConnectionMode>(initial?.mode ?? "local");
  const [region, setRegion] = useState(initial?.region ?? "us-east-1");
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? (initial ? "" : "http://localhost:8000"));
  const [profile, setProfile] = useState(initial?.profile ?? props.profiles[0] ?? "default");
  const [accessKeyId, setAccessKeyId] = useState(initial?.accessKeyId ?? "");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [sessionDirty, setSessionDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  function input(): ConnectionInput {
    return {
      id: initial?.id,
      name,
      region,
      mode,
      endpoint: endpoint.trim() || undefined,
      profile: profile.trim() || undefined,
      accessKeyId: accessKeyId.trim() || undefined,
      secretAccessKey: secretAccessKey || undefined,
      sessionToken: sessionDirty ? sessionToken.trim() || null : undefined,
    };
  }

  async function run(action: "test" | "save") {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      if (action === "test") setMessage(await props.onTest(input()));
      else {
        await props.onSave(input());
        props.onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={initial ? "Edit connection" : "Add connection"}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={() => void run("test")} disabled={busy}>Test</button>
          <span className="spacer" />
          <button className="btn" onClick={props.onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void run("save")} disabled={busy}>Save</button>
        </>
      }
    >
      <div className="stack">
        {!props.encryption ? <div className="banner">This machine has no OS secret store. Access keys will be saved in a private file with weak protection.</div> : null}
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>Mode</span>
          <select
            value={mode}
            onChange={(event) => {
              const next = event.target.value as ConnectionMode;
              if (next === "local" && !endpoint.trim()) setEndpoint("http://localhost:8000");
              if (next !== "local" && mode === "local" && endpoint.trim() === "http://localhost:8000") setEndpoint("");
              setMode(next);
            }}
          >
            {MODES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <div className="inline">
          <label className="field">
            <span>Region</span>
            <input value={region} onChange={(event) => setRegion(event.target.value)} />
          </label>
          <label className="field grow-field">
            <span>Endpoint {mode === "local" ? "" : "(optional)"}</span>
            <input value={endpoint} placeholder="http://localhost:8000" onChange={(event) => setEndpoint(event.target.value)} />
          </label>
        </div>
        {mode === "profile" ? (
          <label className="field">
            <span>Profile</span>
            <input list="aws-profiles" value={profile} onChange={(event) => setProfile(event.target.value)} />
            <datalist id="aws-profiles">{props.profiles.map((item) => <option key={item} value={item}>{item}</option>)}</datalist>
          </label>
        ) : null}
        {mode === "keys" ? (
          <>
            <label className="field">
              <span>Access key ID</span>
              <input value={accessKeyId} onChange={(event) => setAccessKeyId(event.target.value)} autoComplete="off" />
            </label>
            <label className="field">
              <span>Secret access key {initial?.hasSecret ? "(leave blank to keep)" : ""}</span>
              <input type="password" value={secretAccessKey} onChange={(event) => setSecretAccessKey(event.target.value)} autoComplete="off" />
            </label>
            <label className="field">
              <span>Session token {initial?.hasSessionToken ? "(leave blank to keep)" : "(optional)"}</span>
              <input
                type="password"
                value={sessionToken}
                onChange={(event) => {
                  setSessionDirty(true);
                  setSessionToken(event.target.value);
                }}
                autoComplete="off"
              />
            </label>
          </>
        ) : null}
        {mode === "default" ? <p className="muted" style={{ margin: 0 }}>Uses the same chain as the AWS CLI: environment variables, SSO, shared config, then the instance role.</p> : null}
        {mode === "local" ? <p className="muted" style={{ margin: 0 }}>DynamoDB Local accepts any credentials. Start it with Docker on port 8000, then test.</p> : null}
        {message ? <div className="banner">{message}</div> : null}
        {error ? <div className="banner error">{error}</div> : null}
      </div>
    </Dialog>
  );
}
