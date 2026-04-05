/** ShoreGuard plugin instance configuration. */
export interface ShoreGuardConfig {
  shoreguardUrl: string;
  apiKeyRef: string;
  defaultGateway: string;
  autoProvision: boolean;
  defaultImage: string;
  defaultTemplate: string;
  cleanupOnTerminate: boolean;
  paperclipBaseUrl: string;
  webhookSigningSecretRef: string;
  showSidebarLink: boolean;
  showDashboardWidget: boolean;
  showProjectTab: boolean;
}

/** Gateway as returned by GET /api/gateway/list. */
export interface Gateway {
  name: string;
  endpoint: string;
  scheme: string;
  status: string;
  connected: boolean;
  last_status?: string;
  description?: string;
  labels?: Record<string, string>;
}

/** Sandbox record from GET /api/gateways/{gw}/sandboxes. */
export interface Sandbox {
  id: string;
  name: string;
  /** Phase from OpenShell: provisioning, ready, failed, etc. */
  phase: string;
  phase_code: number;
  image: string;
  gpu: boolean;
  namespace?: string;
  created_at_ms?: number;
  current_policy_version?: number;
}

/** Request body for POST /api/gateways/{gw}/sandboxes. */
export interface CreateSandboxInput {
  name?: string;
  image?: string;
  providers?: string[];
  gpu?: boolean;
  environment?: Record<string, string>;
  policy?: Record<string, unknown>;
  presets?: string[];
}

/** Request body for POST /api/gateways/{gw}/sandboxes/{name}/exec. */
export interface ExecInput {
  command: string | string[];
  workdir?: string;
  env?: Record<string, string>;
  timeout_seconds?: number;
}

/** Result from sandbox exec. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}

/** Async operation status from GET /api/operations/{id}. */
export interface Operation {
  operation_id: string;
  status: "running" | "completed" | "failed";
  resource_type: string;
  result?: Record<string, unknown>;
  error?: string;
}

/** Pending approval chunk from GET .../approvals/pending. */
export interface ApprovalChunk {
  chunk_id: string;
  proposed_rule: Record<string, unknown>;
  security_flagged: boolean;
  status: string;
}

/** Sandbox template from GET /api/sandbox-templates. */
export interface SandboxTemplate {
  name: string;
  description?: string;
  image?: string;
  policy?: Record<string, unknown>;
  presets?: string[];
}

/** Health check response from GET /healthz or /readyz. */
export interface HealthResponse {
  status: string;
}

/** Webhook record from GET/POST /api/webhooks. */
export interface WebhookRecord {
  id: number;
  url: string;
  secret: string;
  event_types: string[];
  is_active: boolean;
  channel_type: string;
  created_by: string;
  created_at: string | null;
}