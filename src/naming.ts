/** Shared sandbox naming convention for the adapter and plugin. */

export const SANDBOX_PREFIX = "pc-";

function slugify(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
}

export function agentSandboxName(
  companyName: string,
  agentName: string,
  strategy: "per-agent" | "per-run",
  runId?: string,
): string {
  const coSlug = slugify(companyName).slice(0, 20);
  const agSlug = slugify(agentName).slice(0, 20);
  const base = `${SANDBOX_PREFIX}${coSlug}-${agSlug}`;
  if (strategy === "per-agent") return base;
  const rslug = (runId ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  return `${base}-${rslug}`;
}

export function isAdapterSandbox(name: string): boolean {
  return name.startsWith(SANDBOX_PREFIX);
}

export function extractAgentSlug(sandboxName: string): string | null {
  if (!sandboxName.startsWith(SANDBOX_PREFIX)) return null;
  const rest = sandboxName.slice(SANDBOX_PREFIX.length);
  // per-agent: "pc-{company}-{agent}" → everything
  // per-run: "pc-{company}-{agent}-{runSlug}" → everything before last dash+12chars
  const match = rest.match(/^(.+)-[a-zA-Z0-9]{10,12}$/);
  return match ? match[1] : rest;
}
