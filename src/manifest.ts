import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { PLUGIN_ID, TOOL_NAMES, JOB_KEYS, WEBHOOK_ENDPOINT_KEY } from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "ShoreGuard Sandboxes",
  description:
    "Provisions and manages NVIDIA OpenShell sandboxes via ShoreGuard for Paperclip agents.",
  author: "FloHofstetter",
  categories: ["connector", "automation"],
  capabilities: [
    "agents.read",
    "projects.read",
    "events.subscribe",
    "events.emit",
    "jobs.schedule",
    "webhooks.receive",
    "http.outbound",
    "secrets.read-ref",
    "plugin.state.read",
    "plugin.state.write",
    "agent.tools.register",
    "activity.log.write",
    "instance.settings.register",
    "ui.dashboardWidget.register",
    "ui.detailTab.register",
    "ui.page.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      shoreguardUrl: {
        type: "string",
        title: "ShoreGuard URL",
        default: "http://localhost:8888",
      },
      apiKeyRef: {
        type: "string",
        title: "API Key (secret ref)",
      },
      defaultGateway: {
        type: "string",
        title: "Default Gateway Name",
        default: "",
      },
      autoProvision: {
        type: "boolean",
        title: "Auto-provision sandbox on agent run start",
        default: false,
      },
      defaultImage: {
        type: "string",
        title: "Default Container Image",
        default: "",
      },
      defaultTemplate: {
        type: "string",
        title: "Default Sandbox Template",
        default: "",
      },
      cleanupOnTerminate: {
        type: "boolean",
        title: "Delete sandbox when agent terminates",
        default: true,
      },
      paperclipBaseUrl: {
        type: "string",
        title: "Paperclip Base URL",
        description: "Public URL of this Paperclip instance (for webhook auto-registration)",
        default: "",
      },
      webhookSigningSecretRef: {
        type: "string",
        title: "Webhook Signing Secret (secret ref)",
        description: "Secret ref for the ShoreGuard webhook HMAC signing secret",
        default: "",
      },
    },
    required: ["shoreguardUrl", "apiKeyRef"],
  },
  jobs: [
    {
      jobKey: JOB_KEYS.SYNC_GATEWAYS,
      displayName: "Sync Gateways",
      description: "Polls ShoreGuard for gateway and sandbox state.",
      schedule: "*/5 * * * *",
    },
    {
      jobKey: JOB_KEYS.CHECK_PENDING_APPROVALS,
      displayName: "Check Pending Approvals",
      description: "Polls for new pending approval chunks.",
      schedule: "*/2 * * * *",
    },
  ],
  webhooks: [
    {
      endpointKey: WEBHOOK_ENDPOINT_KEY,
      displayName: "ShoreGuard Events",
      description:
        "Receives webhook events from ShoreGuard (sandbox.created, approval.approved, etc.).",
    },
  ],
  tools: [
    {
      name: TOOL_NAMES.CREATE_SANDBOX,
      displayName: "Create Sandbox",
      description: "Provision a new OpenShell sandbox on the configured ShoreGuard gateway.",
      parametersSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Sandbox name (auto-generated if omitted)" },
          image: { type: "string", description: "Container image" },
          template: { type: "string", description: "Sandbox template name" },
          gpu: { type: "boolean", default: false },
        },
      },
    },
    {
      name: TOOL_NAMES.EXEC_IN_SANDBOX,
      displayName: "Execute in Sandbox",
      description: "Run a command inside an existing sandbox.",
      parametersSchema: {
        type: "object",
        properties: {
          sandbox: { type: "string" },
          command: { type: "string" },
          workdir: { type: "string", default: "" },
          timeout_seconds: { type: "number", default: 60 },
        },
        required: ["sandbox", "command"],
      },
    },
    {
      name: TOOL_NAMES.LIST_SANDBOXES,
      displayName: "List Sandboxes",
      description: "List all sandboxes on the configured gateway.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: TOOL_NAMES.GET_SANDBOX,
      displayName: "Get Sandbox",
      description: "Get details of a specific sandbox.",
      parametersSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
    {
      name: TOOL_NAMES.DELETE_SANDBOX,
      displayName: "Delete Sandbox",
      description: "Delete a sandbox.",
      parametersSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "sg-gateway-health",
        displayName: "ShoreGuard Gateways",
        exportName: "GatewayHealthWidget",
      },
      {
        type: "settingsPage",
        id: "sg-settings",
        displayName: "ShoreGuard Settings",
        exportName: "ShoreGuardSettingsPage",
      },
      {
        type: "page",
        id: "sg-page",
        displayName: "ShoreGuard",
        exportName: "ShoreGuardPage",
        routePath: "shoreguard",
      },
      {
        type: "detailTab",
        id: "sg-project-sandboxes",
        displayName: "Sandboxes",
        exportName: "ProjectSandboxesTab",
        entityTypes: ["project"],
      },
    ],
  },
};

export default manifest;