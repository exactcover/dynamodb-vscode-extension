import type { ClientConfig } from "@dynamodb-client/protocol";
import type { DynamoApi } from "./api";
import { DynamoService } from "./service";

export class ServiceCache {
  private readonly byId = new Map<string, { signature: string; service: DynamoApi }>();

  /** A client that is not cached. Caller must close() it. Used for connection tests. */
  ephemeral(config: ClientConfig): DynamoApi {
    return new DynamoService(config);
  }

  get(config: ClientConfig): DynamoApi {
    const signature = JSON.stringify({
      region: config.region,
      mode: config.mode,
      endpoint: config.endpoint ?? "",
      profile: config.profile ?? "",
      accessKeyId: config.accessKeyId ?? "",
      secretAccessKey: config.secretAccessKey ?? "",
      sessionToken: config.sessionToken ?? "",
    });
    const existing = this.byId.get(config.id);
    if (existing?.signature === signature) return existing.service;
    existing?.service.close();
    const service = new DynamoService(config);
    this.byId.set(config.id, { signature, service });
    return service;
  }
}
