<div align="center">

# Paperclip Plugin & Adapter for ShoreGuard

**Run AI agents in isolated OpenShell sandboxes with network policy enforcement and human-in-the-loop approval.**

[![License](https://img.shields.io/github/license/flohofstetter/paperclip-plugin-shoreguard)](LICENSE)

---

[**Quick Start**](#quick-start) · [**Report Bug**](https://github.com/flohofstetter/paperclip-plugin-shoreguard/issues/new) · [**Request Feature**](https://github.com/flohofstetter/paperclip-plugin-shoreguard/issues/new)

</div>

## What does this do?

This project provides two components for [Paperclip](https://github.com/paperclipai/paperclip) that integrate with [ShoreGuard](https://github.com/flohofstetter/shoreguard) and [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell):

1. **External Adapter** (`adapter/`) — Runs Claude Code inside isolated OpenShell sandboxes instead of directly on the host. Every agent run gets its own container with enforced network policies, filesystem isolation, and credential injection.

2. **Plugin** (`src/`) — Adds sandbox management UI to Paperclip: gateway health monitoring, sandbox lifecycle controls, pending approval handling, and agent-scoped sandbox visibility.

```
Paperclip (orchestrator)
  │
  ├── Adapter: openshell_shoreguard
  │     └── ShoreGuard API → OpenShell Gateway → k3s Pod (sandbox)
  │           ├── Claude Code (pre-installed)
  │           ├── Network policy enforced
  │           └── Credentials injected at runtime
  │
  └── Plugin: paperclip-plugin-shoreguard
        ├── Dashboard: gateway health
        ├── Agent tab: sandbox status + config
        ├── Approval flow: approve/reject network requests
        └── Auto-cleanup on agent termination
```

## Why sandboxed agents?

Without isolation, AI agents run as local processes with full access to filesystem, network, and credentials. That means:

- An agent can exfiltrate code or secrets to any endpoint
- An agent can modify files outside its workspace
- You can't see what network connections an agent makes

With OpenShell sandboxes:

- **Network policy** — only explicitly allowed endpoints are reachable (e.g., Anthropic API + Paperclip API)
- **Human-in-the-loop** — when an agent tries to reach an unknown host, the request is blocked and queued for human approval
- **Filesystem isolation** — each sandbox has its own filesystem, nothing persists unless pushed to git
- **Credential injection** — API keys are injected at runtime via environment variables, never written to disk
- **Full visibility** — you see exactly what your agents try to connect to (including telemetry you might not want)

## Features

- **📦 Sandbox Adapter** — `openshell_shoreguard` adapter type for Paperclip agents, installable via External Adapter UI
- **🔄 Sandbox Lifecycle** — Per-agent (reuse) or per-run (ephemeral) sandbox strategies
- **🛡️ Approval Flow** — Review and approve/reject agent network access requests in the Paperclip UI
- **📊 Gateway Dashboard** — Real-time gateway health and sandbox status monitoring
- **🔧 Agent Sandbox Tab** — See which sandboxes belong to which agent, with config validation
- **🧹 Auto-Cleanup** — Sandboxes are cleaned up on agent termination or run failure
- **📋 Config Generator** — Generate adapter config templates from plugin settings

## Requirements

- [Paperclip](https://github.com/paperclipai/paperclip) (with External Adapter support)
- A running [ShoreGuard](https://github.com/flohofstetter/shoreguard) instance
- An [OpenShell](https://github.com/NVIDIA/OpenShell) gateway registered in ShoreGuard

## Quick Start

### 1. Install the Adapter

In Paperclip: **Settings → Adapters → Install Adapter → Local path**

```
/path/to/paperclip-plugin-shoreguard/adapter
```

Or via npm (once published):

```
paperclip-adapter-openshell-shoreguard
```

### 2. Install the Plugin

In Paperclip: **Settings → Plugins → Install Plugin → Local path**

```
/path/to/paperclip-plugin-shoreguard
```

### 3. Configure the Plugin

In plugin settings, provide:

| Field | Description |
|-------|-------------|
| ShoreGuard URL | API endpoint (e.g., `http://shoreguard:8888`) |
| API Key | Secret reference to a ShoreGuard service principal key |
| Default Gateway | Gateway name (e.g., `dev`) |

### 4. Create an Agent

Create a Paperclip agent with adapter type `openshell_shoreguard` and set the adapter config via API:

```bash
curl -X PATCH -H "Authorization: Bearer $BOARD_KEY" \
  -H 'Content-Type: application/json' \
  "http://paperclip:3100/api/agents/$AGENT_ID" \
  -d '{
    "adapterConfig": {
      "shoreguardUrl": "http://shoreguard:8888",
      "shoreguardApiKey": "sg_...",
      "gateway": "dev",
      "model": "claude-sonnet-4-6",
      "dangerouslySkipPermissions": true,
      "reuseStrategy": "per-agent"
    }
  }'
```

> **Tip:** Use the Config Generator on the plugin settings page to generate this JSON from your plugin configuration.

### 5. Run the Agent

Trigger a run — the adapter will create a sandbox, run Claude Code inside it, and return the results (usage, cost, session, summary) to Paperclip.

## Adapter Configuration

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `shoreguardUrl` | Yes | — | ShoreGuard API base URL |
| `shoreguardApiKey` | Yes | — | Service principal API key |
| `gateway` | Yes | — | OpenShell gateway name |
| `model` | No | — | Claude model ID |
| `maxTurnsPerRun` | No | — | Max turns per run |
| `dangerouslySkipPermissions` | No | `false` | Skip Claude permission prompts |
| `sandboxImage` | No | base image | Container image for sandbox |
| `providers` | No | `[]` | OpenShell provider names (e.g., `["anthropic"]`) |
| `gpu` | No | `false` | Request GPU |
| `reuseStrategy` | No | `per-run` | `per-agent` (reuse) or `per-run` (ephemeral) |
| `timeoutSec` | No | `600` | Execution timeout in seconds |
| `claudeCredentials` | No | — | JSON string from `~/.claude/.credentials.json` for OAuth auth |
| `env` | No | `{}` | Extra environment variables |
| `promptTemplate` | No | default | Prompt template with `{{agentId}}`, `{{agentName}}`, `{{runId}}` |

## Authentication

Claude Code in the sandbox needs authentication. Two options:

**Option A: OAuth Credentials** — Set `claudeCredentials` to the JSON contents of `~/.claude/.credentials.json`. The adapter injects this into the sandbox at runtime. Note: OAuth tokens expire every ~12 hours.

**Option B: API Key Provider** — Register an Anthropic provider in OpenShell with your `ANTHROPIC_API_KEY`, then set `providers: ["anthropic"]` in the adapter config. The provider injects the key automatically.

## Project Structure

```
├── adapter/                    # External Adapter (standalone package)
│   ├── src/
│   │   ├── index.ts            # createServerAdapter() entry point
│   │   ├── shoreguard-client.ts # ShoreGuard REST client
│   │   └── parse.ts            # Claude stream-json output parser
│   ├── package.json
│   └── tsconfig.json
│
├── src/                        # Paperclip Plugin
│   ├── worker.ts               # Plugin worker (tools, jobs, events)
│   ├── manifest.ts             # Plugin manifest (capabilities, UI slots)
│   ├── shoreguard-client.ts    # Full ShoreGuard REST client
│   ├── naming.ts               # Shared sandbox naming convention
│   ├── types.ts                # TypeScript types
│   ├── constants.ts            # Keys for data/actions/state
│   └── ui/
│       ├── ShoreGuardPage.tsx  # Full sandbox management page
│       ├── AgentSandboxesTab.tsx # Agent detail tab
│       ├── SettingsPage.tsx    # Plugin settings + config generator
│       ├── GatewayHealthWidget.tsx # Dashboard widget
│       └── ...
│
├── tests/                      # Tests
├── scripts/                    # Build scripts
└── package.json
```

## Development

```bash
# Install dependencies
npm install
cd adapter && npm install && cd ..

# Type check everything
npm run typecheck
cd adapter && npm run typecheck && cd ..

# Build plugin + UI
npm run build

# Build adapter
cd adapter && npm run build

# Run tests
npm test
```

## Security

The adapter passes credentials via exec-level environment variables, not shell interpolation. Credentials exist only for the duration of the exec call and are not persisted in the sandbox filesystem.

Network access from sandboxes is blocked by default. The approval flow lets you review and decide on every new endpoint an agent tries to reach — including telemetry you might not expect.

To report a security vulnerability, please open a [GitHub Security Advisory](https://github.com/flohofstetter/paperclip-plugin-shoreguard/security/advisories/new).

## License

This project is licensed under the [Apache License 2.0](LICENSE).