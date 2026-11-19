import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const apiKeysPath = fileURLToPath(new URL("../../../.api-keys.local.json", import.meta.url));
type KeyName = "OPENAI_API_KEY" | "NVIDIA_API_KEY";
export type SavedKeys = Partial<Record<KeyName, string>>;

export function readApiKeys(target = apiKeysPath): SavedKeys {
  if (!fs.existsSync(target)) return {};
  const data: unknown = JSON.parse(fs.readFileSync(target, "utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid API key settings file");
  const keys: SavedKeys = {};
  for (const name of ["OPENAI_API_KEY", "NVIDIA_API_KEY"] as const) {
    const value = (data as Record<string, unknown>)[name];
    if (value !== undefined) {
      if (typeof value !== "string" || !value.trim() || /[\r\n]/.test(value)) throw new Error("Invalid saved API key");
      keys[name] = value.trim();
    }
  }
  return keys;
}

export function saveApiKey(name: KeyName, value: string, target = apiKeysPath): void {
  if (!value.trim() || /[\r\n]/.test(value)) throw new Error("Invalid API key");
  const keys = { ...readApiKeys(target), [name]: value.trim() };
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(keys, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
