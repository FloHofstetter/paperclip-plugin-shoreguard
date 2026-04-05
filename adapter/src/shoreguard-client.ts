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

export interface ExecInput {
  command: string | string[];
  timeout_seconds?: number;
  env?: Record<string, string>;
}

export interface Operation {
  operation_id: string;
  status: "running" | "completed" | "failed";
  error?: string;
}

/** Thrown when a ShoreGuard request times out (fetch abort, HTTP 408/504). */
export class ShoreGuardTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShoreGuardTimeoutError";
  }
}

/** Thrown when a ShoreGuard API call returns an error status. */
export class ShoreGuardApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(`ShoreGuard ${status}: ${detail}`);
    this.name = "ShoreGuardApiError";
  }
}

export class ShoreGuardClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly defaultTimeoutMs: number;

  constructor(opts: { baseUrl: string; apiKey: string; timeoutMs?: number }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.headers = {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    };
    this.defaultTimeoutMs = opts.timeoutMs ?? 30_000;
  }

  private async request<T>(method: string, path: string, body?: unknown, timeoutMs?: number): Promise<T> {
    const effectiveTimeout = timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeout);

    try {
      const init: RequestInit = { method, headers: this.headers, signal: controller.signal };
      if (body !== undefined) init.body = JSON.stringify(body);
      const res = await fetch(`${this.baseUrl}${path}`, init);

      if (res.status === 408 || res.status === 504) {
        const text = await res.text().catch(() => "");
        throw new ShoreGuardTimeoutError(`ShoreGuard ${res.status}: ${text}`);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new ShoreGuardApiError(res.status, text);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof ShoreGuardTimeoutError || err instanceof ShoreGuardApiError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ShoreGuardTimeoutError(`Request timed out after ${effectiveTimeout}ms: ${method} ${path}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
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

  async execInSandbox(gw: string, name: string, body: ExecInput): Promise<ExecResult> {
    // Exec timeout = command timeout + 30s buffer for gRPC overhead
    const requestTimeout = ((body.timeout_seconds ?? 600) + 30) * 1000;
    return this.request("POST", `/api/gateways/${enc(gw)}/sandboxes/${enc(name)}/exec`, body, requestTimeout);
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
    throw new ShoreGuardTimeoutError(`Operation poll timed out after ${timeoutMs}ms`);
  }
}

function enc(s: string): string {
  return encodeURIComponent(s);
}