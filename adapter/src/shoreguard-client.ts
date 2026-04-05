/** Minimal ShoreGuard REST client for the adapter. */

export interface SandboxRecord {
  id: string;
  name: string;
  phase: string;
  [key: string]: unknown;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}

export interface CreateSandboxInput {
  name?: string;
  image?: string;
  providers?: string[];
  gpu?: boolean;
  environment?: Record<string, string>;
}

export interface Operation {
  operation_id: string;
  status: "running" | "completed" | "failed";
  error?: string;
}

export class ShoreGuardClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(opts: { baseUrl: string; apiKey: string }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.headers = {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method, headers: this.headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(`${this.baseUrl}${path}`, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ShoreGuard ${res.status}: ${text}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async listSandboxes(gw: string, opts?: { limit?: number }): Promise<SandboxRecord[]> {
    const qs = opts?.limit ? `?limit=${opts.limit}` : "";
    return this.request("GET", `/api/gateways/${enc(gw)}/sandboxes${qs}`);
  }

  async getSandbox(gw: string, name: string): Promise<SandboxRecord> {
    return this.request("GET", `/api/gateways/${enc(gw)}/sandboxes/${enc(name)}`);
  }

  async createSandbox(gw: string, body: CreateSandboxInput): Promise<{ operation_id: string }> {
    return this.request("POST", `/api/gateways/${enc(gw)}/sandboxes`, body);
  }

  async deleteSandbox(gw: string, name: string): Promise<void> {
    await this.request("DELETE", `/api/gateways/${enc(gw)}/sandboxes/${enc(name)}`);
  }

  async execInSandbox(gw: string, name: string, body: { command: string | string[]; timeout_seconds?: number }): Promise<ExecResult> {
    return this.request("POST", `/api/gateways/${enc(gw)}/sandboxes/${enc(name)}/exec`, body);
  }

  async pollOperation(operationId: string, timeoutMs = 300_000): Promise<Operation> {
    const start = Date.now();
    let delay = 500;
    while (Date.now() - start < timeoutMs) {
      const op = await this.request<Operation>("GET", `/api/operations/${enc(operationId)}`);
      if (op.status === "completed" || op.status === "failed") return op;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 1.5, 5_000);
    }
    throw new Error(`Operation timed out after ${timeoutMs}ms`);
  }
}

function enc(s: string): string {
  return encodeURIComponent(s);
}