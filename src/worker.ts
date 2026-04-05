import {
  definePlugin,
  runWorker,
  type PluginContext,
  type PluginEvent,
  type PluginJobContext,
  type ToolResult,
  type ToolRunContext,
  type PluginWebhookInput,
  type PluginHealthDiagnostics,
  type PluginConfigValidationResult,
} from "@paperclipai/plugin-sdk";
import { ShoreGuardClient, ShoreGuardApiError } from "./shoreguard-client.js";
import {
  PLUGIN_ID,
  TOOL_NAMES,
  JOB_KEYS,
  DATA_KEYS,
  ACTION_KEYS,
  STATE_KEYS,
  WEBHOOK_ENDPOINT_KEY,
} from "./constants.js";
import { verifySignature } from "./webhook-verify.js";
import type { ShoreGuardConfig, Gateway, Sandbox, ApprovalChunk } from "./types.js";

let client: ShoreGuardClient | null = null;
let config: ShoreGuardConfig | null = null;
let pluginCtx: PluginContext | null = null;

async function resolveClient(ctx: PluginContext): Promise<ShoreGuardClient> {
  if (client) return client;
  const raw = (await ctx.config.get()) as unknown as ShoreGuardConfig;
  config = raw;
  const apiKey = await ctx.secrets.resolve(raw.apiKeyRef);
  client = new ShoreGuardClient({ baseUrl: raw.shoreguardUrl, apiKey });
  return client;
}

function getGateway(): string {
  return config?.defaultGateway || "";
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

const plugin = definePlugin({
  async setup(ctx: PluginContext) {
    ctx.logger.info("ShoreGuard plugin starting");

    await resolveClient(ctx);

    // -- Tools ----------------------------------------------------------------

    registerTools(ctx);

    // -- Jobs -----------------------------------------------------------------

    registerJobs(ctx);

    // -- Data handlers (for UI) -----------------------------------------------

    registerDataHandlers(ctx);

    // -- Action handlers (for UI) ---------------------------------------------

    registerActionHandlers(ctx);

    // -- Event handlers -------------------------------------------------------

    registerEventHandlers(ctx);

    // Store ctx for use in onWebhook
    pluginCtx = ctx;

    // -- Webhook auto-registration --------------------------------------------

    await autoRegisterWebhook(ctx);

    ctx.logger.info("ShoreGuard plugin setup complete");
  },

  async onHealth(): Promise<PluginHealthDiagnostics> {
    if (!client) return { status: "error", message: "Client not initialized" };
    try {
      await client.healthz();
      const ready = await client.readyz();
      if (ready.status !== "ok") {
        return { status: "degraded", message: "ShoreGuard not ready", details: { ...ready } };
      }
      return { status: "ok", message: "Connected to ShoreGuard" };
    } catch (err) {
      return {
        status: "error",
        message: `Cannot reach ShoreGuard: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },

  async onValidateConfig(
    rawConfig: Record<string, unknown>,
  ): Promise<PluginConfigValidationResult> {
    const cfg = rawConfig as unknown as ShoreGuardConfig;
    const errors: string[] = [];
    if (!cfg.shoreguardUrl) errors.push("shoreguardUrl is required");
    if (!cfg.apiKeyRef) errors.push("apiKeyRef is required");
    if (errors.length > 0) return { ok: false, errors };

    try {
      const testClient = new ShoreGuardClient({ baseUrl: cfg.shoreguardUrl, apiKey: "validate" });
      await testClient.healthz();
    } catch {
      return {
        ok: true,
        warnings: ["Could not reach ShoreGuard — check URL and API key after saving"],
      };
    }
    return { ok: true };
  },

  async onConfigChanged(newConfig: Record<string, unknown>): Promise<void> {
    config = newConfig as unknown as ShoreGuardConfig;
    client = null; // force re-creation on next use
  },

  async onWebhook(input: PluginWebhookInput): Promise<void> {
    const ctx = pluginCtx;
    if (!ctx) return;

    // Verify HMAC signature if signing secret is configured
    if (config?.webhookSigningSecretRef) {
      try {
        const secret = await ctx.secrets.resolve(config.webhookSigningSecretRef);
        const sigHeader = Array.isArray(input.headers["x-shoreguard-signature"])
          ? input.headers["x-shoreguard-signature"][0]
          : input.headers["x-shoreguard-signature"];
        if (!sigHeader || !verifySignature(input.rawBody, sigHeader, secret)) {
          ctx.logger.warn("Webhook signature verification failed");
          return;
        }
      } catch (err) {
        ctx.logger.warn("Could not verify webhook signature", { error: formatError(err) });
      }
    }

    const body = input.parsedBody as Record<string, unknown> | undefined;
    if (!body) return;

    const eventType = body.event_type as string | undefined;
    if (!eventType) return;

    ctx.logger.info("ShoreGuard webhook received", { eventType });

    // Invalidate cached state so UI refreshes
    const gw = getGateway();
    if (gw && (eventType.startsWith("sandbox.") || eventType.startsWith("gateway."))) {
      try {
        const sg = await resolveClient(ctx);
        const gateways = await sg.listGateways();
        await ctx.state.set({ scopeKind: "instance", stateKey: STATE_KEYS.GATEWAYS }, gateways);
      } catch {
        // best effort cache refresh
      }
    }
  },

  async onShutdown(): Promise<void> {
    client = null;
    config = null;
  },
});

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

function registerTools(ctx: PluginContext): void {
  ctx.tools.register(
    TOOL_NAMES.CREATE_SANDBOX,
    {
      displayName: "Create Sandbox",
      description: "Provision a new OpenShell sandbox on the configured ShoreGuard gateway.",
      parametersSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          image: { type: "string" },
          template: { type: "string" },
          gpu: { type: "boolean", default: false },
        },
      },
    },
    async (params, runCtx: ToolRunContext): Promise<ToolResult> => {
      const sg = await resolveClient(ctx);
      const gw = getGateway();
      if (!gw) return { error: "No default gateway configured" };

      const p = params as { name?: string; image?: string; template?: string; gpu?: boolean };
      const sandboxName = p.name || `agent-${runCtx.agentId.slice(0, 8)}`;

      try {
        // If a template is specified, fetch it for defaults
        let templateImage = config?.defaultImage || "";
        if (p.template || config?.defaultTemplate) {
          try {
            const tmpl = await sg.getTemplate(p.template || config!.defaultTemplate);
            if (tmpl.image) templateImage = tmpl.image;
          } catch {
            // template not found, continue with defaults
          }
        }

        const { operation_id } = await sg.createSandbox(gw, {
          name: sandboxName,
          image: p.image || templateImage,
          gpu: p.gpu ?? false,
        });

        const op = await sg.pollOperation(operation_id);
        if (op.status === "failed") {
          return { error: `Sandbox creation failed: ${op.error}` };
        }

        // Store agent-to-sandbox mapping for cleanup
        await ctx.state.set(
          { scopeKind: "agent", scopeId: runCtx.agentId, stateKey: STATE_KEYS.AGENT_SANDBOX },
          sandboxName,
        );

        const sandbox = await sg.getSandbox(gw, sandboxName);
        return {
          content: `Sandbox "${sandboxName}" created on gateway "${gw}"`,
          data: sandbox,
        };
      } catch (err) {
        return { error: formatError(err) };
      }
    },
  );

  ctx.tools.register(
    TOOL_NAMES.EXEC_IN_SANDBOX,
    {
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
    async (params): Promise<ToolResult> => {
      const sg = await resolveClient(ctx);
      const gw = getGateway();
      if (!gw) return { error: "No default gateway configured" };

      const p = params as {
        sandbox: string;
        command: string;
        workdir?: string;
        timeout_seconds?: number;
      };

      try {
        const result = await sg.execInSandbox(gw, p.sandbox, {
          command: p.command,
          workdir: p.workdir,
          timeout_seconds: p.timeout_seconds ?? 60,
        });
        return {
          content: result.stdout || result.stderr || "(no output)",
          data: result,
        };
      } catch (err) {
        return { error: formatError(err) };
      }
    },
  );

  ctx.tools.register(
    TOOL_NAMES.LIST_SANDBOXES,
    {
      displayName: "List Sandboxes",
      description: "List all sandboxes on the configured gateway.",
      parametersSchema: { type: "object", properties: {} },
    },
    async (): Promise<ToolResult> => {
      const sg = await resolveClient(ctx);
      const gw = getGateway();
      if (!gw) return { error: "No default gateway configured" };

      try {
        const sandboxes = await sg.listSandboxes(gw);
        return {
          content: `Found ${sandboxes.length} sandbox(es) on gateway "${gw}"`,
          data: sandboxes,
        };
      } catch (err) {
        return { error: formatError(err) };
      }
    },
  );

  ctx.tools.register(
    TOOL_NAMES.GET_SANDBOX,
    {
      displayName: "Get Sandbox",
      description: "Get details of a specific sandbox.",
      parametersSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
    async (params): Promise<ToolResult> => {
      const sg = await resolveClient(ctx);
      const gw = getGateway();
      if (!gw) return { error: "No default gateway configured" };

      const p = params as { name: string };
      try {
        const sandbox = await sg.getSandbox(gw, p.name);
        return { content: `Sandbox "${p.name}" phase: ${sandbox.phase}`, data: sandbox };
      } catch (err) {
        return { error: formatError(err) };
      }
    },
  );

  ctx.tools.register(
    TOOL_NAMES.DELETE_SANDBOX,
    {
      displayName: "Delete Sandbox",
      description: "Delete a sandbox.",
      parametersSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
    async (params): Promise<ToolResult> => {
      const sg = await resolveClient(ctx);
      const gw = getGateway();
      if (!gw) return { error: "No default gateway configured" };

      const p = params as { name: string };
      try {
        await sg.deleteSandbox(gw, p.name);
        return { content: `Sandbox "${p.name}" deleted` };
      } catch (err) {
        return { error: formatError(err) };
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Job registration
// ---------------------------------------------------------------------------

function registerJobs(ctx: PluginContext): void {
  ctx.jobs.register(JOB_KEYS.SYNC_GATEWAYS, async (_job: PluginJobContext) => {
    const sg = await resolveClient(ctx);
    try {
      const gateways = await sg.listGateways();
      await ctx.state.set(
        { scopeKind: "instance", stateKey: STATE_KEYS.GATEWAYS },
        gateways,
      );

      // Cache sandboxes per gateway
      for (const gw of gateways) {
        try {
          const sandboxes = await sg.listSandboxes(gw.name);
          await ctx.state.set(
            { scopeKind: "instance", stateKey: `${STATE_KEYS.SANDBOX_PREFIX}${gw.name}` },
            sandboxes,
          );
        } catch (err) {
          ctx.logger.warn(`Failed to sync sandboxes for gateway ${gw.name}`, {
            error: formatError(err),
          });
        }
      }

      ctx.logger.info("Gateway sync complete", { gatewayCount: gateways.length });
    } catch (err) {
      ctx.logger.error("Gateway sync failed", { error: formatError(err) });
    }
  });

  ctx.jobs.register(
    JOB_KEYS.CHECK_PENDING_APPROVALS,
    async (_job: PluginJobContext) => {
      const sg = await resolveClient(ctx);
      const gw = getGateway();
      if (!gw) return;

      try {
        // Get cached sandbox list
        const sandboxes =
          ((await ctx.state.get({
            scopeKind: "instance",
            stateKey: `${STATE_KEYS.SANDBOX_PREFIX}${gw}`,
          })) as Sandbox[] | null) ?? [];

        const allPending: Array<ApprovalChunk & { sandbox: string }> = [];

        for (const sb of sandboxes) {
          try {
            const chunks = await sg.getPendingApprovals(gw, sb.name);
            for (const chunk of chunks) {
              allPending.push({ ...chunk, sandbox: sb.name });
            }
          } catch {
            // sandbox may not have approvals enabled
          }
        }

        // Store for UI
        await ctx.state.set(
          { scopeKind: "instance", stateKey: STATE_KEYS.PENDING_APPROVALS },
          allPending,
        );

        if (allPending.length > 0) {
          ctx.logger.info("Pending approvals found", { count: allPending.length });
        }
      } catch (err) {
        ctx.logger.error("Approval check failed", { error: formatError(err) });
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Data handlers (for UI)
// ---------------------------------------------------------------------------

function registerDataHandlers(ctx: PluginContext): void {
  ctx.data.register(DATA_KEYS.GATEWAY_HEALTH, async () => {
    const gateways =
      ((await ctx.state.get({
        scopeKind: "instance",
        stateKey: STATE_KEYS.GATEWAYS,
      })) as Gateway[] | null) ?? [];
    return gateways;
  });

  ctx.data.register(DATA_KEYS.SANDBOX_LIST, async () => {
    const gw = getGateway();
    if (!gw) return [];
    const sandboxes =
      ((await ctx.state.get({
        scopeKind: "instance",
        stateKey: `${STATE_KEYS.SANDBOX_PREFIX}${gw}`,
      })) as Sandbox[] | null) ?? [];
    return sandboxes;
  });

  ctx.data.register(DATA_KEYS.PENDING_APPROVALS, async () => {
    return (
      ((await ctx.state.get({
        scopeKind: "instance",
        stateKey: STATE_KEYS.PENDING_APPROVALS,
      })) as unknown) ?? []
    );
  });

  ctx.data.register(DATA_KEYS.UI_CONFIG, async () => {
    return {
      showSidebarLink: config?.showSidebarLink ?? true,
      showDashboardWidget: config?.showDashboardWidget ?? true,
      showProjectTab: config?.showProjectTab ?? true,
    };
  });

  ctx.data.register(DATA_KEYS.TEMPLATES, async () => {
    try {
      const sg = await resolveClient(ctx);
      return await sg.listTemplates();
    } catch {
      return [];
    }
  });

  ctx.data.register(DATA_KEYS.AGENT_SANDBOXES, async (params) => {
    const gw = getGateway();
    if (!gw) return { sandboxes: [], config: null };

    const p = params as { agentId?: string } | undefined;
    const agentId = p?.agentId;
    if (!agentId) return { sandboxes: [], config: null };

    const { isAdapterSandbox, extractAgentSlug } = await import("./naming.js");
    const agentSlug = agentId.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 40);

    // Get all sandboxes and filter by agent slug
    const allSandboxes =
      ((await ctx.state.get({
        scopeKind: "instance",
        stateKey: `${STATE_KEYS.SANDBOX_PREFIX}${gw}`,
      })) as Sandbox[] | null) ?? [];

    const agentSandboxes = allSandboxes.filter((sb) => {
      if (!isAdapterSandbox(sb.name)) return false;
      return extractAgentSlug(sb.name) === agentSlug;
    });

    // Read agent config for display (need companyId from event context)
    let adapterConfig: Record<string, unknown> | null = null;
    try {
      // Try to find the agent across companies the plugin can see
      const companies = await ctx.companies.list();
      for (const co of companies) {
        const agent = await ctx.agents.get(agentId, co.id);
        if (agent) {
          adapterConfig = agent.adapterConfig;
          break;
        }
      }
    } catch {
      // Agent read may fail
    }

    return { sandboxes: agentSandboxes, adapterConfig };
  });
}

// ---------------------------------------------------------------------------
// Action handlers (for UI)
// ---------------------------------------------------------------------------

function registerActionHandlers(ctx: PluginContext): void {
  ctx.actions.register(ACTION_KEYS.TEST_CONNECTION, async () => {
    try {
      const sg = await resolveClient(ctx);
      const health = await sg.healthz();
      const ready = await sg.readyz();
      return { success: true, health, ready };
    } catch (err) {
      return { success: false, error: formatError(err) };
    }
  });

  ctx.actions.register(ACTION_KEYS.APPROVE_CHUNK, async (params) => {
    const sg = await resolveClient(ctx);
    const gw = getGateway();
    const p = params as { sandbox: string; chunkId: string };
    await sg.approveChunk(gw, p.sandbox, p.chunkId);
    return { approved: true };
  });

  ctx.actions.register(ACTION_KEYS.REJECT_CHUNK, async (params) => {
    const sg = await resolveClient(ctx);
    const gw = getGateway();
    const p = params as { sandbox: string; chunkId: string; reason?: string };
    await sg.rejectChunk(gw, p.sandbox, p.chunkId, p.reason);
    return { rejected: true };
  });

  ctx.actions.register(ACTION_KEYS.GENERATE_ADAPTER_CONFIG, async () => {
    if (!config) return { error: "Plugin not configured" };
    const template: Record<string, unknown> = {
      shoreguardUrl: config.shoreguardUrl,
      shoreguardApiKey: "<your-service-principal-key>",
      gateway: config.defaultGateway || "dev",
      dangerouslySkipPermissions: true,
      model: "claude-sonnet-4-6",
      reuseStrategy: "per-agent",
    };
    if (config.defaultImage) template.sandboxImage = config.defaultImage;
    return { config: JSON.stringify(template, null, 2) };
  });

  ctx.actions.register(ACTION_KEYS.VALIDATE_AGENT_CONFIG, async (params) => {
    const p = params as { agentId?: string };
    if (!p.agentId) return { success: false, error: "No agentId provided" };

    try {
      // Find agent across companies
      const companies = await ctx.companies.list();
      let adapterConfig: Record<string, unknown> | null = null;
      for (const co of companies) {
        const agent = await ctx.agents.get(p.agentId, co.id);
        if (agent) { adapterConfig = agent.adapterConfig; break; }
      }
      if (!adapterConfig) return { success: false, error: "Agent not found" };

      const url = adapterConfig.shoreguardUrl as string;
      const key = adapterConfig.shoreguardApiKey as string;
      const gw = adapterConfig.gateway as string;
      if (!url || !key || !gw) return { success: false, error: "Missing shoreguardUrl, shoreguardApiKey, or gateway" };

      const { ShoreGuardClient } = await import("./shoreguard-client.js");
      const client = new ShoreGuardClient({ baseUrl: url, apiKey: key });
      await client.listSandboxes(gw, { limit: 1 });
      return { success: true };
    } catch (err) {
      return { success: false, error: formatError(err) };
    }
  });

  ctx.actions.register(ACTION_KEYS.DELETE_SANDBOX, async (params) => {
    const sg = await resolveClient(ctx);
    const gw = getGateway();
    const p = params as { name: string };
    await sg.deleteSandbox(gw, p.name);
    return { deleted: true };
  });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function registerEventHandlers(ctx: PluginContext): void {
  ctx.events.on("agent.run.started", async (event: PluginEvent) => {
    if (!config?.autoProvision) return;
    const gw = getGateway();
    if (!gw) return;

    const agentId = event.entityId ?? "unknown";
    const { agentSandboxName } = await import("./naming.js");
    const sandboxName = agentSandboxName(agentId, "per-run", event.eventId ?? String(Date.now()));

    ctx.logger.info("Auto-provisioning sandbox for agent run", { agentId, sandboxName });

    try {
      const sg = await resolveClient(ctx);
      const { operation_id } = await sg.createSandbox(gw, {
        name: sandboxName,
        image: config.defaultImage || undefined,
        gpu: false,
      });

      const op = await sg.pollOperation(operation_id, 60_000);
      if (op.status === "completed") {
        await ctx.state.set(
          { scopeKind: "agent", scopeId: agentId, stateKey: STATE_KEYS.AGENT_SANDBOX },
          sandboxName,
        );
        await ctx.activity.log({
          companyId: event.companyId,
          message: `Sandbox "${sandboxName}" auto-provisioned for agent ${agentId}`,
        });
      }
    } catch (err) {
      ctx.logger.error("Auto-provision failed", { agentId, error: formatError(err) });
    }
  });

  ctx.events.on("agent.status_changed", async (event: PluginEvent) => {
    if (!config?.cleanupOnTerminate) return;
    const payload = event.payload as { status?: string } | undefined;
    if (payload?.status !== "terminated") return;

    const agentId = event.entityId;
    if (!agentId) return;
    const gw = getGateway();
    if (!gw) return;

    const storedName = (await ctx.state.get({
      scopeKind: "agent",
      scopeId: agentId,
      stateKey: STATE_KEYS.AGENT_SANDBOX,
    })) as string | null;

    ctx.logger.info("Cleaning up sandboxes for terminated agent", { agentId, storedName });

    try {
      const sg = await resolveClient(ctx);
      const { isAdapterSandbox, extractAgentSlug } = await import("./naming.js");
      const agentSlug = agentId.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 40);

      // Delete plugin-tracked sandbox
      if (storedName) {
        await sg.deleteSandbox(gw, storedName).catch(() => {});
      }

      // Also find and delete adapter-created sandboxes matching this agent
      const allSandboxes = await sg.listSandboxes(gw).catch(() => []);
      for (const sb of allSandboxes) {
        if (!isAdapterSandbox(sb.name)) continue;
        const slug = extractAgentSlug(sb.name);
        if (slug === agentSlug) {
          ctx.logger.info("Deleting adapter sandbox", { sandboxName: sb.name });
          await sg.deleteSandbox(gw, sb.name).catch(() => {});
        }
      }

      await ctx.activity.log({
        companyId: event.companyId,
        message: `Sandboxes cleaned up after agent ${agentId} terminated`,
      });
    } catch (err) {
      ctx.logger.warn("Sandbox cleanup failed", { agentId, error: formatError(err) });
    }
  });
}

// ---------------------------------------------------------------------------
// Webhook auto-registration
// ---------------------------------------------------------------------------

const ALL_SHOREGUARD_EVENTS = [
  "gateway.registered",
  "gateway.unregistered",
  "sandbox.created",
  "sandbox.deleted",
  "policy.updated",
  "approval.approved",
  "approval.rejected",
  "inference.updated",
];

async function autoRegisterWebhook(ctx: PluginContext): Promise<void> {
  if (!config?.paperclipBaseUrl) {
    ctx.logger.info("paperclipBaseUrl not set — skipping webhook auto-registration");
    return;
  }

  const webhookUrl =
    `${config.paperclipBaseUrl.replace(/\/+$/, "")}/api/plugins/${PLUGIN_ID}` +
    `/webhooks/${WEBHOOK_ENDPOINT_KEY}`;

  try {
    const sg = await resolveClient(ctx);
    const existing = await sg.listWebhooks();
    const alreadyRegistered = existing.some((wh) => wh.url === webhookUrl && wh.is_active);

    if (alreadyRegistered) {
      ctx.logger.info("ShoreGuard webhook already registered", { url: webhookUrl });
      return;
    }

    const created = await sg.createWebhook(webhookUrl, ALL_SHOREGUARD_EVENTS);
    ctx.logger.info("ShoreGuard webhook auto-registered", {
      webhookId: created.id,
      url: webhookUrl,
    });

    // Store the signing secret so the operator can reference it
    await ctx.state.set(
      { scopeKind: "instance", stateKey: "webhook-signing-secret" },
      created.secret,
    );
    ctx.logger.info(
      "Webhook signing secret stored in plugin state (key: webhook-signing-secret). " +
        "Set webhookSigningSecretRef in config to enable signature verification.",
    );
  } catch (err) {
    ctx.logger.warn("Webhook auto-registration failed", { error: formatError(err) });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatError(err: unknown): string {
  if (err instanceof ShoreGuardApiError) {
    return `${err.status}: ${err.detail}`;
  }
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default plugin;
runWorker(plugin, import.meta.url);