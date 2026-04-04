import type {
  Gateway,
  Sandbox,
  CreateSandboxInput,
  ExecInput,
  WebhookRecord,
  ExecResult,
  Operation,
  ApprovalChunk,
  SandboxTemplate,
  HealthResponse,
} from "./types.js";

/** Options for constructing the ShoreGuard client. */
export interface ShoreGuardClientOptions {
  baseUrl: string;
  apiKey: string;
}

/** Error thrown when a ShoreGuard API call fails. */
export class ShoreGuardApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(`ShoreGuard API error ${status}: ${detail}`);
    this.name = "ShoreGuardApiError";
  }
}

/**
 * Thin REST client for the ShoreGuard API.
 *
 * All methods add `Authorization: Bearer {apiKey}` and expect JSON responses.
 */
export class ShoreGuardClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(opts: ShoreGuardClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.headers = {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = { method, headers: this.headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text();
      let detail = text;
      try {
        const json = JSON.parse(text) as { detail?: string };
        if (json.detail) detail = json.detail;
      } catch {
        // keep raw text
      }
      throw new ShoreGuardApiError(res.status, detail);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // -- Health -----------------------------------------------------------------

  async healthz(): Promise<HealthResponse> {
    return this.request("GET", "/healthz");
  }

  async readyz(): Promise<HealthResponse> {
    return this.request("GET", "/readyz");
  }

  // -- Gateways ---------------------------------------------------------------

  async listGateways(): Promise<Gateway[]> {
    return this.request("GET", "/api/gateway/list");
  }

  async getGateway(name: string): Promise<Gateway> {
    return this.request("GET", `/api/gateway/${enc(name)}/info`);
  }

  // -- Sandboxes --------------------------------------------------------------

  async listSandboxes(
    gateway: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<Sandbox[]> {
    const params = new URLSearchParams();
    if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts?.offset !== undefined) params.set("offset", String(opts.offset));
    const qs = params.toString();
    return this.request("GET", `/api/gateways/${enc(gateway)}/sandboxes${qs ? `?${qs}` : ""}`);
  }

  async createSandbox(
    gateway: string,
    body: CreateSandboxInput,
  ): Promise<{ operation_id: string }> {
    return this.request("POST", `/api/gateways/${enc(gateway)}/sandboxes`, body);
  }

  async getSandbox(gateway: string, name: string): Promise<Sandbox> {
    return this.request("GET", `/api/gateways/${enc(gateway)}/sandboxes/${enc(name)}`);
  }

  async deleteSandbox(gateway: string, name: string): Promise<{ deleted: boolean }> {
    return this.request("DELETE", `/api/gateways/${enc(gateway)}/sandboxes/${enc(name)}`);
  }

  async execInSandbox(gateway: string, name: string, body: ExecInput): Promise<ExecResult> {
    return this.request("POST", `/api/gateways/${enc(gateway)}/sandboxes/${enc(name)}/exec`, body);
  }

  // -- Operations -------------------------------------------------------------

  async getOperation(operationId: string): Promise<Operation> {
    return this.request("GET", `/api/operations/${enc(operationId)}`);
  }

  /**
   * Poll an async operation until it completes or times out.
   *
   * Uses exponential backoff starting at 500ms, capped at 5s.
   */
  async pollOperation(operationId: string, timeoutMs = 120_000): Promise<Operation> {
    const start = Date.now();
    let delay = 500;
    while (Date.now() - start < timeoutMs) {
      const op = await this.getOperation(operationId);
      if (op.status === "completed" || op.status === "failed") return op;
      await sleep(delay);
      delay = Math.min(delay * 1.5, 5_000);
    }
    throw new Error(`Operation ${operationId} timed out after ${timeoutMs}ms`);
  }

  // -- Approvals --------------------------------------------------------------

  async getPendingApprovals(gateway: string, sandbox: string): Promise<ApprovalChunk[]> {
    return this.request(
      "GET",
      `/api/gateways/${enc(gateway)}/sandboxes/${enc(sandbox)}/approvals/pending`,
    );
  }

  async approveChunk(gateway: string, sandbox: string, chunkId: string): Promise<void> {
    await this.request(
      "POST",
      `/api/gateways/${enc(gateway)}/sandboxes/${enc(sandbox)}/approvals/${enc(chunkId)}/approve`,
    );
  }

  async rejectChunk(
    gateway: string,
    sandbox: string,
    chunkId: string,
    reason?: string,
  ): Promise<void> {
    await this.request(
      "POST",
      `/api/gateways/${enc(gateway)}/sandboxes/${enc(sandbox)}/approvals/${enc(chunkId)}/reject`,
      { reason: reason ?? "" },
    );
  }

  // -- Templates --------------------------------------------------------------

  async listTemplates(): Promise<SandboxTemplate[]> {
    return this.request("GET", "/api/sandbox-templates");
  }

  async getTemplate(name: string): Promise<SandboxTemplate> {
    return this.request("GET", `/api/sandbox-templates/${enc(name)}`);
  }

  // -- Webhooks ---------------------------------------------------------------

  async listWebhooks(): Promise<WebhookRecord[]> {
    return this.request("GET", "/api/webhooks");
  }

  async createWebhook(url: string, eventTypes: string[]): Promise<WebhookRecord> {
    return this.request("POST", "/api/webhooks", { url, event_types: eventTypes });
  }

  async deleteWebhook(webhookId: number): Promise<void> {
    await this.request("DELETE", `/api/webhooks/${webhookId}`);
  }
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}