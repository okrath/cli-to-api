import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const repoRoot = resolve(import.meta.dirname, "../../..");
const defaultEnvPath = resolve(repoRoot, ".env");

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default("127.0.0.1"),
  DATA_DIR: z.string().default("./data"),
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD must be at least 8 characters"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export type GatewayConfig = {
  port: number;
  host: string;
  dataDir: string;
  adminPassword: string;
  logLevel: string;
  dbPath: string;
  repoRoot: string;
  mcpBaseUrl: string;
};

export function loadConfig(options?: { envFile?: string | false }): GatewayConfig {
  const envFile = options?.envFile ?? defaultEnvPath;
  if (envFile !== false && existsSync(envFile)) {
    loadDotenv({ path: envFile, override: false });
  }

  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    console.error(`Configuration error: ${message}`);
    process.exit(1);
  }

  const dataDir = resolve(repoRoot, parsed.data.DATA_DIR);
  const host = parsed.data.HOST;
  const port = parsed.data.PORT;
  const mcpHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return {
    port,
    host,
    dataDir,
    adminPassword: parsed.data.ADMIN_PASSWORD,
    logLevel: parsed.data.LOG_LEVEL,
    dbPath: resolve(dataDir, "cli-to-api.db"),
    repoRoot,
    mcpBaseUrl: `http://${mcpHost}:${port}`,
  };
}
