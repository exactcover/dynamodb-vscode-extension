import {
  applyConnectionUpdate,
  toClientConfig,
  type ClientConfig,
  type ConnectionInput,
  type PublicConnection,
  type SecretMaterial,
} from "@dynamodb-client/protocol";

export interface ConnectionRepository {
  load(): Promise<{ records: PublicConnection[]; secrets: Record<string, SecretMaterial> }>;
  persist(records: PublicConnection[], secrets: Record<string, SecretMaterial>): Promise<void>;
}

export class ConnectionBook {
  constructor(private readonly repo: ConnectionRepository) {}

  async list(): Promise<PublicConnection[]> {
    const { records } = await this.repo.load();
    return records;
  }

  async save(input: ConnectionInput): Promise<PublicConnection> {
    const state = await this.repo.load();
    let previous: { id: string; secret: SecretMaterial } | undefined;
    if (input.id) {
      if (!state.records.some((record) => record.id === input.id)) throw new Error("Connection not found.");
      previous = { id: input.id, secret: state.secrets[input.id] ?? {} };
    }
    const next = applyConnectionUpdate(input, previous);
    const records = state.records.filter((record) => record.id !== next.record.id);
    records.push(next.record);
    records.sort((a, b) => a.name.localeCompare(b.name));
    state.secrets[next.record.id] = next.secret;
    await this.repo.persist(records, state.secrets);
    return next.record;
  }

  async delete(id: string): Promise<void> {
    const state = await this.repo.load();
    if (!state.records.some((record) => record.id === id)) throw new Error("Connection not found.");
    delete state.secrets[id];
    await this.repo.persist(
      state.records.filter((record) => record.id !== id),
      state.secrets,
    );
  }

  async configFor(id: string): Promise<ClientConfig> {
    const state = await this.repo.load();
    const record = state.records.find((item) => item.id === id);
    if (!record) throw new Error("Connection not found.");
    const secret = state.secrets[id] ?? {};
    if (record.mode === "keys" && (!secret.accessKeyId || !secret.secretAccessKey)) {
      throw new Error("Saved access keys are missing. Edit the connection and enter them again.");
    }
    return toClientConfig(record, secret);
  }

  /** Resolve a form, including blank secrets that mean "keep the saved secret". Does not save. */
  async preview(input: ConnectionInput): Promise<ClientConfig> {
    const state = await this.repo.load();
    const known = input.id ? state.records.some((record) => record.id === input.id) : false;
    const previous = known && input.id ? { id: input.id, secret: state.secrets[input.id] ?? {} } : undefined;
    const next = applyConnectionUpdate(input, previous);
    return toClientConfig(next.record, next.secret);
  }
}
