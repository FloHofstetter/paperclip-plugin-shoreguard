import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  ServerAdapterModule,
} from "@paperclipai/adapter-utils";
import { ShoreGuardClient } from "./shoreguard-client.js";
import { parseClaudeStreamJson } from "./parse.js";

function str(v: unknown, fb = ""): string { return typeof v === "string" ? v : fb; }
function num(v: unknown, fb = 0): number { const n = Number(v); return Number.isFinite(n) ? n : fb; }
function bool(v: unknown, fb = false): boolean { return typeof v === "boolean" ? v : fb; }
function strArr(v: unknown): string[] { return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; }
function obj(v: unknown): Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {}; }

async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, config, context, onLog, onMeta } = ctx;
  const sgUrl = str(config.shoreguardUrl), sgKey = str(config.shoreguardApiKey), gw = str(config.gateway);

  if (!sgUrl || !sgKey || !gw) {
    return { exitCode: 1, signal: null, timedOut: false, errorMessage: "Missing: shoreguardUrl, shoreguardApiKey, gateway.", errorCode: "config_error" };
  }

  const client = new ShoreGuardClient({ baseUrl: sgUrl, apiKey: sgKey });
  const model = str(config.model);
  const maxTurns = num(config.maxTurnsPerRun);
  const skipPerms = bool(config.dangerouslySkipPermissions);
  const strategy = str(config.reuseStrategy, "per-run");
  const providers = strArr(config.providers);
  const image = str(config.sandboxImage);
  const gpu = bool(config.gpu);
  const timeout = num(config.timeoutSec, 600);
  const envCfg = obj(config.env);
  const tmpl = str(config.promptTemplate, "You are agent {{agentId}} ({{agentName}}). Continue your Paperclip work.");

  const prompt = tmpl.replace(/\{\{agentId\}\}/g, agent.id).replace(/\{\{agentName\}\}/g, agent.name ?? agent.id).replace(/\{\{runId\}\}/g, runId);

  const env: Record<string, string> = { PAPERCLIP_AGENT_ID: agent.id, PAPERCLIP_COMPANY_ID: agent.companyId, PAPERCLIP_RUN_ID: runId };
  for (const [k, v] of Object.entries(envCfg)) { if (typeof v === "string") env[k] = v; }
  const tid = str(context.taskId) || str(context.issueId);
  if (tid) env.PAPERCLIP_TASK_ID = tid;

  const slug = agent.id.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 40);
  const rslug = runId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  const sbName = strategy === "per-agent" ? `pc-${slug}` : `pc-${slug}-${rslug}`;

  let created = false;
  try {
    await onLog("stdout", `[openshell] Resolving sandbox "${sbName}" (${strategy})...\n`);
    const ex = await client.getSandbox(gw, sbName).catch(() => null);
    if (ex && ex.phase === "ready" && strategy === "per-agent") {
      await onLog("stdout", `[openshell] Reusing sandbox.\n`);
    } else {
      if (ex) await client.deleteSandbox(gw, sbName).catch(() => {});
      const op = await client.createSandbox(gw, { name: sbName, image: image || undefined, providers: providers.length ? providers : undefined, gpu: gpu || undefined, environment: env });
      const r = await client.pollOperation(op.operation_id);
      if (r.status === "failed") return { exitCode: 1, signal: null, timedOut: false, errorMessage: `Sandbox failed: ${r.error ?? "unknown"}`, errorCode: "sandbox_error" };
      created = true;
      await onLog("stdout", `[openshell] Sandbox "${sbName}" ready.\n`);
    }
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, signal: null, timedOut: false, errorMessage: `Sandbox error: ${m}`, errorCode: "sandbox_error" };
  }

  const args = ["claude", "--print", "-", "--output-format", "stream-json", "--verbose"];
  if (skipPerms) args.push("--dangerously-skip-permissions");
  if (model) args.push("--model", model);
  if (maxTurns > 0) args.push("--max-turns", String(maxTurns));

  // If claudeCredentials is set, write ~/.claude/.credentials.json before starting.
  // This enables OAuth/subscription auth inside the sandbox without an API key.
  const creds = str(config.claudeCredentials);
  const credsSetup = creds
    ? `mkdir -p ~/.claude && echo '${creds.replace(/'/g, "'\\''")}' > ~/.claude/.credentials.json && `
    : "";
  const cmd = `${credsSetup}echo '${prompt.replace(/'/g, "'\\''")}' | ${args.join(" ")}`;

  if (onMeta) await onMeta({ adapterType: "openshell_shoreguard", command: "claude (sandbox)", cwd: "/", commandArgs: args.slice(1), prompt, context });

  await onLog("stdout", `[openshell] Executing Claude Code in sandbox...\n`);
  let stdout = "", stderr = "", exitCode = -1, timedOut = false;

  try {
    const r = await client.execInSandbox(gw, sbName, { command: ["sh", "-c", cmd], timeout_seconds: timeout > 0 ? timeout : undefined });
    stdout = r.stdout; stderr = r.stderr; exitCode = r.exit_code;
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    if (m.includes("timeout")) timedOut = true;
    stderr = m;
  }

  if (stdout) await onLog("stdout", stdout);
  if (stderr) await onLog("stderr", stderr);

  if (strategy === "per-run" && created) client.deleteSandbox(gw, sbName).catch(() => {});

  if (timedOut) return { exitCode, signal: null, timedOut: true, errorMessage: `Timed out after ${timeout}s`, errorCode: "timeout" };

  const p = parseClaudeStreamJson(stdout);
  if (exitCode !== 0 && !p.resultJson) {
    const line = stderr.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
    return { exitCode, signal: null, timedOut: false, errorMessage: line ? `Claude exited ${exitCode}: ${line}` : `Claude exited ${exitCode}` };
  }

  return {
    exitCode, signal: null, timedOut: false,
    errorMessage: exitCode === 0 ? null : (p.summary || `Claude exited ${exitCode}`),
    usage: p.usage ?? undefined, sessionId: p.sessionId,
    sessionParams: p.sessionId ? { sessionId: p.sessionId, sandbox: sbName } : null,
    provider: "anthropic", biller: "anthropic",
    model: p.model || model || null, billingType: "api",
    costUsd: p.costUsd ?? undefined, resultJson: p.resultJson ?? undefined,
    summary: p.summary || undefined,
  };
}

async function testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const c = obj(ctx.config);
  const url = str(c.shoreguardUrl), key = str(c.shoreguardApiKey), gw = str(c.gateway);

  if (!url) checks.push({ code: "missing_url", level: "error", message: "shoreguardUrl not configured." });
  if (!key) checks.push({ code: "missing_key", level: "error", message: "shoreguardApiKey not configured." });
  if (!gw) checks.push({ code: "missing_gw", level: "error", message: "gateway not configured." });

  if (url && key && gw) {
    try {
      await new ShoreGuardClient({ baseUrl: url, apiKey: key }).listSandboxes(gw, { limit: 1 });
      checks.push({ code: "api_ok", level: "info", message: `ShoreGuard reachable, gateway "${gw}" connected.` });
    } catch (err) {
      checks.push({ code: "api_error", level: "error", message: `ShoreGuard error: ${err instanceof Error ? err.message : err}` });
    }
  }

  return { adapterType: ctx.adapterType, status: checks.some((c) => c.level === "error") ? "fail" : "pass", checks, testedAt: new Date().toISOString() };
}

export function createServerAdapter(): ServerAdapterModule {
  return {
    type: "openshell_shoreguard",
    execute,
    testEnvironment,
    models: [
      { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-6", label: "Claude Haiku 4.6" },
    ],
    agentConfigurationDoc: `# openshell adapter

Runs Claude Code inside an OpenShell sandbox managed by ShoreGuard.

Required: shoreguardUrl, shoreguardApiKey, gateway
Auth: claudeCredentials (JSON string from ~/.claude/.credentials.json) OR providers: ["anthropic"] with API key provider
Optional: model, maxTurnsPerRun, dangerouslySkipPermissions, sandboxImage, providers, gpu, reuseStrategy, timeoutSec, env, promptTemplate
`,
  };
}