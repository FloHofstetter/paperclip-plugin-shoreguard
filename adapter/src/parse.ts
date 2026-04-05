export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export interface ParsedOutput {
  sessionId: string | null;
  model: string;
  costUsd: number | null;
  usage: UsageSummary | null;
  summary: string;
  resultJson: Record<string, unknown> | null;
}

export function parseClaudeStreamJson(stdout: string): ParsedOutput {
  let sessionId: string | null = null;
  let model = "";
  let finalResult: Record<string, unknown> | null = null;
  const texts: string[] = [];

  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let ev: Record<string, unknown>;
    try { ev = JSON.parse(line); } catch { continue; }

    const type = typeof ev.type === "string" ? ev.type : "";
    if (type === "system" && ev.subtype === "init") {
      sessionId = s(ev.session_id) || sessionId;
      model = s(ev.model) || model;
    } else if (type === "assistant") {
      sessionId = s(ev.session_id) || sessionId;
      const msg = ev.message as Record<string, unknown> | undefined;
      for (const b of (Array.isArray(msg?.content) ? msg.content : [])) {
        if (b && typeof b === "object" && !Array.isArray(b) && (b as any).type === "text")
          texts.push(s((b as any).text));
      }
    } else if (type === "result") {
      finalResult = ev;
      sessionId = s(ev.session_id) || sessionId;
    }
  }

  if (!finalResult) return { sessionId, model, costUsd: null, usage: null, summary: texts.join("\n\n").trim(), resultJson: null };

  const u = (finalResult.usage ?? {}) as Record<string, unknown>;
  const usage: UsageSummary = { inputTokens: n(u.input_tokens), outputTokens: n(u.output_tokens), cachedInputTokens: n(u.cache_read_input_tokens) };
  const cost = typeof finalResult.total_cost_usd === "number" ? finalResult.total_cost_usd : null;
  const summary = s(finalResult.result) || texts.join("\n\n").trim();

  return { sessionId, model, costUsd: cost, usage, summary, resultJson: finalResult };
}

function s(v: unknown): string { return typeof v === "string" ? v : ""; }
function n(v: unknown): number { const x = Number(v); return Number.isFinite(x) ? x : 0; }