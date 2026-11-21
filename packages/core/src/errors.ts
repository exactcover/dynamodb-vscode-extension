export function errorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const name = "name" in err ? String(err.name) : "";
    const message = "message" in err && typeof err.message === "string" ? err.message : "";
    if (name === "CredentialsProviderError") {
      return `${message} Check the profile, or run aws sso login and try again.`;
    }
    if (message && name && name !== "Error") return `${name}: ${message}`;
    if (message) return message;
  }
  return err instanceof Error ? err.message : String(err);
}
