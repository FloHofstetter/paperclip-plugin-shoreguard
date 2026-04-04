export const PLUGIN_ID = "paperclip-plugin-shoreguard";

export const TOOL_NAMES = {
  CREATE_SANDBOX: "create-sandbox",
  EXEC_IN_SANDBOX: "exec-in-sandbox",
  LIST_SANDBOXES: "list-sandboxes",
  GET_SANDBOX: "get-sandbox",
  DELETE_SANDBOX: "delete-sandbox",
} as const;

export const JOB_KEYS = {
  SYNC_GATEWAYS: "sync-gateways",
  CHECK_PENDING_APPROVALS: "check-pending-approvals",
} as const;

export const DATA_KEYS = {
  GATEWAY_HEALTH: "gateway-health",
  SANDBOX_LIST: "sandbox-list",
  PENDING_APPROVALS: "pending-approvals",
  TEMPLATES: "templates",
} as const;

export const ACTION_KEYS = {
  APPROVE_CHUNK: "approve-chunk",
  REJECT_CHUNK: "reject-chunk",
  TEST_CONNECTION: "test-connection",
} as const;

export const STATE_KEYS = {
  GATEWAYS: "gateways",
  SANDBOX_PREFIX: "sandboxes:",
  PENDING_APPROVALS: "pending-approvals",
  AGENT_SANDBOX: "sandbox-name",
} as const;

export const WEBHOOK_ENDPOINT_KEY = "shoreguard-events";