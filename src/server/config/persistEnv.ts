import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));

export function persistEnvKey(keyName: "OPENAI_API_KEY" | "NVIDIA_API_KEY", value: string, target = envPath): void {
  if (/[\r\n]/.test(value)) throw new Error("Invalid API key");
  const content = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  const assignment = new RegExp(`^\\s*(?:export\\s+)?${keyName}\\s*=`);
  const lines = content.split(/\r?\n/).filter((line) => !assignment.test(line));
  // Append one active assignment; commented examples and unrelated settings stay intact.
  const updated = `${lines.join("\n").replace(/\n*$/, "")}\n${keyName}=${JSON.stringify(value)}\n`;
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, updated, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
