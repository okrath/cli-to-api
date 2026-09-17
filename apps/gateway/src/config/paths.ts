import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// apps/gateway/src/config -> apps/gateway -> root
export const projectRoot = path.resolve(__dirname, "../../../..");

export const dataDir = path.isAbsolute(env.DATA_DIR)
  ? env.DATA_DIR
  : path.resolve(projectRoot, env.DATA_DIR);

export const sandboxesDir = path.join(dataDir, "sandboxes");
export const dbFile = path.join(dataDir, "sqlite.db");
export const tempDir = path.join(dataDir, "tmp");
export const adaptersDir = path.resolve(projectRoot, "adapters");
export const customAdaptersDir = path.join(dataDir, "adapters");
