import { z } from "zod";

export const ModelTierEnum = z.enum(["low", "medium", "high", "xhigh"]);
export type ModelTier = z.infer<typeof ModelTierEnum>;

export const AdapterModelSchema = z.object({
  id: z.string().min(1, "Model ID is required"),
  name: z.string().min(1, "Model name is required"),
  tier: ModelTierEnum.default("medium"),
  context_window: z.number().int().positive().default(128000),
  cost_weight: z.number().positive().default(1.0),
  is_default: z.boolean().default(false),
});
export type AdapterModel = z.infer<typeof AdapterModelSchema>;

export const RateLimitPatternSchema = z.object({
  pattern: z.string().min(1, "Regex pattern is required"),
  cooldown_seconds_default: z.number().int().positive().default(1800),
  dynamic_extractor: z.boolean().default(true),
});
export type RateLimitPattern = z.infer<typeof RateLimitPatternSchema>;

export const AdapterConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/, "Adapter ID must be kebab-case or alphanumeric"),
  name: z.string().min(1, "Adapter name is required"),
  version: z.string().default("1.0.0"),
  executable: z.string().min(1, "Executable name or path is required"),
  execution_mode: z.enum(["pty", "pipe"]).default("pipe"),
  models: z.array(AdapterModelSchema).optional().default([]),
  invocation: z.object({
    args_template: z.array(z.string()).describe("Argument list with placeholders: {model}, {prompt}"),
    args_template_file: z.array(z.string()).optional().describe("Argument list when using temp file: {model}, {prompt_file}"),
    args_template_resume: z.array(z.string()).optional().describe("Argument list when resuming session: {model}, {session_id}, {prompt}"),
    args_template_resume_file: z.array(z.string()).optional().describe("Argument list when resuming session via file"),
    prompt_transport: z.enum(["auto", "argv", "stdin", "temp_file"]).default("auto"),
    prompt_threshold_chars: z.number().int().positive().default(4000),
    working_dir_template: z.string().default("{account_dir}/workspace"),
    timeout_seconds: z.number().int().positive().default(300),
  }),
  environment_isolation: z.object({
    home_dir_override: z.boolean().default(true),
    xdg_override: z.boolean().default(true),
    env_overrides: z.record(z.string()).default({}),
  }).default({}),
  output_parser: z.object({
    type: z.enum(["regex_stream", "json_lines", "raw_text"]).default("regex_stream"),
    strip_ansi: z.boolean().default(true),
    resolve_carriage_return: z.boolean().default(true),
    chunk_regex: z.string().default("(?s)(.*)"),
  }).default({}),
  error_handling: z.object({
    rate_limit_patterns: z.array(RateLimitPatternSchema).default([]),
    fatal_error_patterns: z.array(z.string()).default([]),
  }).default({}),
  concurrency: z.object({
    max_concurrent_per_account: z.number().int().positive().default(1),
  }).default({ max_concurrent_per_account: 1 }),
}).transform((data) => {
  const models = data.models && data.models.length > 0
    ? data.models
    : [
        {
          id: data.id,
          name: `${data.name} Default Model`,
          tier: "medium" as const,
          context_window: 128000,
          cost_weight: 1.0,
          is_default: true,
        },
      ];

  if (!models.some((m) => m.is_default)) {
    models[0].is_default = true;
  }

  return {
    ...data,
    models,
  };
});

export type AdapterConfig = z.output<typeof AdapterConfigSchema>;
