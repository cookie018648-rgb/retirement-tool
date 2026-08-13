import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * 依存パッケージなしの最小 .env ローダー。
 * すでに process.env にある値は上書きしない（シェルの export が優先）。
 */
export function loadEnv(envPath = path.join(projectRoot, ".env")) {
  if (!fs.existsSync(envPath)) return;

  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * 画面から入力された設定を .env に保存し、現在のプロセスにも反映する。
 * 同じキーの行があれば置き換える。
 */
export function saveEnvValues(values, envPath = path.join(projectRoot, ".env")) {
  const lines = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8").split(/\r?\n/)
    : [];

  for (const [key, rawValue] of Object.entries(values)) {
    const value = String(rawValue).trim();
    const entry = `${key}=${value}`;
    const index = lines.findIndex((line) => line.trim().startsWith(`${key}=`));
    if (index === -1) lines.push(entry);
    else lines[index] = entry;
    process.env[key] = value;
  }

  fs.writeFileSync(envPath, lines.join("\n").replace(/\n*$/, "\n"), "utf8");
}

export function saveApiKey(key, envPath = path.join(projectRoot, ".env")) {
  saveEnvValues({ ANTHROPIC_API_KEY: key }, envPath);
}

export const PROJECT_ROOT = projectRoot;
export const DEFAULT_MODEL = "claude-opus-5";
export const DEFAULT_EFFORT = "medium";
