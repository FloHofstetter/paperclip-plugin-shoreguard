/** Shared sandbox naming convention for the adapter and plugin. */

export const SANDBOX_PREFIX = "pc-";

export function agentSandboxName(agentId: string, strategy: "per-agent" | "per-run", runId?: string): string {
  const slug = agentId.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 40);
  if (strategy === "per-agent") return `${SANDBOX_PREFIX}${slug}`;
  const rslug = (runId ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  return `${SANDBOX_PREFIX}${slug}-${rslug}`;
}

export function isAdapterSandbox(name: string): boolean {
  return name.startsWith(SANDBOX_PREFIX);
}

export function extractAgentSlug(sandboxName: string): string | null {
  if (!sandboxName.startsWith(SANDBOX_PREFIX)) return null;
  const rest = sandboxName.slice(SANDBOX_PREFIX.length);
  // per-agent: "pc-{slug}" → slug is everything
  // per-run: "pc-{slug}-{runSlug}" → slug is everything before last dash+12chars
  const match = rest.match(/^(.+)-[a-zA-Z0-9]{10,12}$/);
  return match ? match[1] : rest;
}
