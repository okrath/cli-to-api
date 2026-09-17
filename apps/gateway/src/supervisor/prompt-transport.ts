import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { EffortLevel } from "../db/schema.js";

export interface PreparedInvocation {
  finalArgs: string[];
  stdinContent?: string;
  cleanupHook?: () => Promise<void>;
  isTempFile: boolean;
}

export function compileEffortFlags(adapterId?: string, level?: EffortLevel | null): string[] {
  if (!level || level === "none" || !adapterId) return [];

  // 1. Claude Code CLI: uses --effort <low|medium|high|xhigh>
  if (adapterId === "claude-code" || adapterId.startsWith("claude")) {
    const claudeMap: Record<EffortLevel, string> = {
      none: "none",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
    };
    return ["--effort", claudeMap[level]];
  }

  // 2. OpenAI Codex CLI: uses -c model_reasoning_effort=<low|medium|high>
  if (adapterId === "codex-cli" || adapterId.startsWith("codex")) {
    const codexMap: Record<EffortLevel, string> = {
      none: "none",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "high",
    };
    return ["-c", `model_reasoning_effort=${codexMap[level]}`];
  }

  // 3. OMP CLI: uses --effort <level>
  if (adapterId === "omp-cli" || adapterId.startsWith("omp")) {
    return ["--effort", level];
  }

  // 4. Devin CLI: uses --reasoning <level>
  if (adapterId === "devin-cli" || adapterId.startsWith("devin")) {
    return ["--reasoning", level];
  }

  // 5. OpenCode CLI: uses --effort <level>
  if (adapterId === "opencode-cli" || adapterId.startsWith("opencode")) {
    return ["--effort", level];
  }

  return [];
}

/**
 * Injects effort flags into the arguments template before the prompt or at the end of options.
 */
function injectEffortArgs(template: string[], effortFlags: string[]): string[] {
  if (effortFlags.length === 0) return template;

  // If template explicitly contains {effort} or {effort_flags}, replace it
  if (template.some((arg) => arg.includes("{effort}"))) {
    return template.flatMap((arg) => (arg === "{effort}" ? effortFlags : [arg]));
  }

  // Otherwise, inject effortFlags before prompt placeholder, or before the last argument
  const promptIdx = template.findIndex((arg) => arg === "{prompt}" || arg === "{prompt_file}");
  if (promptIdx !== -1) {
    return [
      ...template.slice(0, promptIdx),
      ...effortFlags,
      ...template.slice(promptIdx),
    ];
  }

  // For stdin or commands without explicit {prompt}, inject before trailing "-" or at the end
  const dashIdx = template.lastIndexOf("-");
  if (dashIdx !== -1) {
    return [
      ...template.slice(0, dashIdx),
      ...effortFlags,
      ...template.slice(dashIdx),
    ];
  }

  return [...template, ...effortFlags];
}

export async function preparePromptTransport(params: {
  argsTemplate: string[];
  argsTemplateFile?: string[];
  prompt: string;
  model: string;
  accountDir: string;
  preferredTransport: "argv" | "stdin" | "temp_file" | "auto";
  promptThresholdChars?: number;
  sessionId?: string;
  effortLevel?: EffortLevel | null;
  adapterId?: string;
}): Promise<PreparedInvocation> {
  const {
    argsTemplate,
    argsTemplateFile,
    prompt,
    model,
    accountDir,
    preferredTransport,
    promptThresholdChars = 4000,
    sessionId,
    effortLevel,
    adapterId,
  } = params;

  // Compile effort flags based on adapterId and effortLevel
  const effortFlags = compileEffortFlags(adapterId, effortLevel);

  // Calculate length of command arguments
  const rawArgvLength =
    argsTemplate.reduce((acc, arg) => acc + arg.length, 0) +
    effortFlags.reduce((acc, arg) => acc + arg.length, 0) +
    prompt.length;

  let mode = preferredTransport;
  if (mode === "auto") {
    // Windows argv limit is 8,191 chars. Switch to temp_file if > promptThresholdChars.
    mode = rawArgvLength > promptThresholdChars ? "temp_file" : "argv";
  }

  if (mode === "temp_file") {
    const tmpDir = path.join(accountDir, "tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    const tempFilePath = path.join(tmpDir, `prompt_${randomUUID()}.txt`);
    await fs.writeFile(tempFilePath, prompt, "utf8");

    // Use argsTemplateFile if specified, otherwise substitute inside argsTemplate
    const baseTemplate = argsTemplateFile && argsTemplateFile.length > 0
      ? argsTemplateFile
      : argsTemplate;

    const templateWithEffort = injectEffortArgs(baseTemplate, effortFlags);

    const finalArgs = templateWithEffort.map((arg) => {
      return arg
        .replace(/{model}/g, model)
        .replace(/{prompt}/g, tempFilePath)
        .replace(/{prompt_file}/g, tempFilePath)
        .replace(/{session_id}/g, sessionId || "");
    });

    const cleanupHook = async (): Promise<void> => {
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // Silently ignore unlink error if already deleted
      }
    };

    return { finalArgs, cleanupHook, isTempFile: true };
  }

  if (mode === "stdin") {
    const templateWithEffort = injectEffortArgs(argsTemplate, effortFlags);
    const finalArgs = templateWithEffort
      .filter((arg) => arg !== "{prompt}" && arg !== "{prompt_file}")
      .map((arg) => arg.replace(/{model}/g, model).replace(/{session_id}/g, sessionId || ""));

    return { finalArgs, stdinContent: prompt, isTempFile: false };
  }

  // Standard argv substitution
  const templateWithEffort = injectEffortArgs(argsTemplate, effortFlags);
  const finalArgs = templateWithEffort.map((arg) => {
    return arg
      .replace(/{model}/g, model)
      .replace(/{prompt}/g, prompt)
      .replace(/{session_id}/g, sessionId || "");
  });

  return { finalArgs, isTempFile: false };
}
