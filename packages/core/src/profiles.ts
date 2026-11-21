import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Profile names from ~/.aws/credentials and ~/.aws/config. */
export function listAwsProfiles(): string[] {
  const files = [
    path.join(os.homedir(), ".aws", "credentials"),
    path.join(os.homedir(), ".aws", "config"),
  ];
  const profiles = new Set<string>();
  for (const file of files) {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const match of text.matchAll(/^\s*\[(?:profile\s+)?([^\]]+)\]\s*$/gm)) {
      const name = match[1]?.trim();
      if (name) profiles.add(name);
    }
  }
  return [...profiles].toSorted((a, b) => a.localeCompare(b));
}
