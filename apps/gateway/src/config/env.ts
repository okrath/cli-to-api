import { z } from "zod";

export const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default("0.0.0.0"),
  DATA_DIR: z.string().default("./data"),
  ADMIN_TOKEN: z.string().optional().default("admin-secret"),
  DEFAULT_API_KEY: z.string().default("sk-cta-dev"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(custom?: Record<string, string | undefined>): Env {
  const source = custom || process.env;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    console.error("Invalid environment configuration:", parsed.error.format());
    throw new Error("Failed to validate environment variables");
  }
  return parsed.data;
}

export const env = loadEnv();
