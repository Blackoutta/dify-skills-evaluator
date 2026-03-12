import { spawn } from "node:child_process";
import path from "node:path";

import type { AgentRunner } from "@/src/server/runners/agent-runner";
import type {
  RunnerExecutionInput,
  RunnerExecutionResult,
  RunnerUsage,
} from "@/src/server/types/contracts";

export interface CommandExecutionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type CommandExecutor = (input: {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}) => Promise<CommandExecutionResult>;

export function buildCodexPrompt(input: RunnerExecutionInput): string {
  const appEnvKeys = Object.keys(input.env)
    .filter((key) => key.startsWith("DIFY_APP_BASE_URL_"))
    .sort();
  const artifacts = input.artifactBindings
    .map((artifact) => `- ${artifact.artifactId}: ${artifact.absolutePath}`)
    .join("\n");

  return [
    `Test case: ${input.testCase.id}`,
    `Use the skill at: ${input.skillPath}`,
    `Workspace root: ${input.workspaceRoot}`,
    `Run directory: ${input.workingDirectory}`,
    input.testCase.promptForAgent,
    "Available app aliases:",
    ...appEnvKeys.map((key) => `- ${key.replace("DIFY_APP_BASE_URL_", "").toLowerCase()}`),
    "Artifacts:",
    artifacts || "- none",
  ].join("\n");
}

export const defaultCommandExecutor: CommandExecutor = async ({
  command,
  args,
  cwd,
  env,
  timeoutMs,
  onStdout,
  onStderr,
}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      onStdout?.(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      onStderr?.(text);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
  });

export interface CodexRunnerDeps {
  executeCommand?: CommandExecutor;
  now?: () => Date;
}

const CODEX_EXEC_ARGS = ["exec", "--dangerously-bypass-approvals-and-sandbox", "--json"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractCodexUsage(stdout: string): RunnerUsage | undefined {
  let lastUsage: RunnerUsage | undefined;

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!isRecord(parsed) || parsed.type !== "turn.completed" || !isRecord(parsed.usage)) {
      continue;
    }

    const inputTokens =
      typeof parsed.usage.input_tokens === "number" ? parsed.usage.input_tokens : undefined;
    const cachedInputTokens =
      typeof parsed.usage.cached_input_tokens === "number"
        ? parsed.usage.cached_input_tokens
        : undefined;
    const outputTokens =
      typeof parsed.usage.output_tokens === "number" ? parsed.usage.output_tokens : undefined;
    const totalTokens =
      inputTokens === undefined && outputTokens === undefined
        ? undefined
        : (inputTokens ?? 0) + (outputTokens ?? 0);

    lastUsage = {
      inputTokens,
      cachedInputTokens,
      outputTokens,
      totalTokens,
    };
  }

  return lastUsage;
}

export class CodexRunner implements AgentRunner {
  readonly kind = "codex";

  private readonly executeCommand: CommandExecutor;
  private readonly now: () => Date;

  constructor(deps: CodexRunnerDeps = {}) {
    this.executeCommand = deps.executeCommand ?? defaultCommandExecutor;
    this.now = deps.now ?? (() => new Date());
  }

  async run(input: RunnerExecutionInput): Promise<RunnerExecutionResult> {
    const startedAt = this.now();
    const stdoutPath = path.join(input.workingDirectory, "runner-output.log");
    const stderrPath = path.join(input.workingDirectory, "runner-error.log");
    const prompt = buildCodexPrompt(input);

    const result = await this.executeCommand({
      command: process.env.CODEX_RUNNER_BIN ?? "codex",
      args: [...CODEX_EXEC_ARGS, "--cd", input.workspaceRoot, prompt],
      cwd: input.workingDirectory,
      env: input.env,
      timeoutMs: input.timeoutMs,
      onStdout: input.onStdout,
      onStderr: input.onStderr,
    });

    const endedAt = this.now();
    return {
      runnerKind: this.kind,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime(),
      exitCode: result.exitCode,
      status: result.timedOut ? "timed_out" : result.exitCode === 0 ? "completed" : "failed",
      stdoutPath,
      stderrPath,
      usage: extractCodexUsage(result.stdout),
    };
  }
}
