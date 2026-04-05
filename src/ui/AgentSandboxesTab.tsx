import { usePluginData, usePluginAction, useHostContext } from "@paperclipai/plugin-sdk/ui";
import type { PluginDetailTabProps } from "@paperclipai/plugin-sdk/ui";
import { useState } from "react";
import type { Sandbox } from "../types.js";
import { DATA_KEYS, ACTION_KEYS } from "../constants.js";
import {
  layoutStack,
  tableStyle,
  thStyle,
  tdStyle,
  mutedText,
  statusBadge,
  dangerButtonStyle,
  cardStyle,
} from "./styles.js";

interface AgentSandboxData {
  sandboxes: Sandbox[];
  adapterConfig: Record<string, unknown> | null;
}

const SENSITIVE_KEYS = new Set(["shoreguardApiKey", "claudeCredentials"]);

function maskValue(key: string, value: unknown): string {
  if (SENSITIVE_KEYS.has(key) && typeof value === "string" && value.length > 8) {
    return value.slice(0, 8) + "***";
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

export function AgentSandboxesTab(props: PluginDetailTabProps) {
  const ctx = useHostContext();
  const agentId = ctx?.entityId;

  const { data, loading, error, refresh } = usePluginData<AgentSandboxData>(
    DATA_KEYS.AGENT_SANDBOXES,
    { agentId },
  );
  const deleteSandbox = usePluginAction(ACTION_KEYS.DELETE_SANDBOX);
  const validateConfig = usePluginAction(ACTION_KEYS.VALIDATE_AGENT_CONFIG);

  const [configOpen, setConfigOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ success: boolean; error?: string } | null>(null);

  if (loading) return <div style={mutedText}>Loading...</div>;
  if (error) return <div style={mutedText}>Error: {error.message}</div>;

  const sandboxes = data?.sandboxes ?? [];
  const adapterConfig = data?.adapterConfig ?? null;

  const handleDelete = async (name: string) => {
    await deleteSandbox({ name });
    refresh();
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const result = await validateConfig({ agentId });
      setValidationResult(result as { success: boolean; error?: string });
    } catch (err) {
      setValidationResult({ success: false, error: String(err) });
    }
    setValidating(false);
  };

  return (
    <div style={layoutStack}>
      {/* Sandboxes */}
      {sandboxes.length === 0 ? (
        <div style={mutedText}>No active sandboxes for this agent.</div>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Image</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {sandboxes.map((sb) => (
              <tr key={sb.name}>
                <td style={tdStyle}>{sb.name}</td>
                <td style={tdStyle}>
                  <span style={statusBadge(sb.phase)}>{sb.phase}</span>
                </td>
                <td style={{ ...tdStyle, ...mutedText }}>{sb.image}</td>
                <td style={tdStyle}>
                  <button style={dangerButtonStyle} onClick={() => handleDelete(sb.name)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Adapter Configuration */}
      {adapterConfig && (
        <div style={cardStyle}>
          <button
            onClick={() => setConfigOpen(!configOpen)}
            style={{
              appearance: "none",
              border: "none",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
              padding: 0,
              width: "100%",
              textAlign: "left",
            }}
          >
            {configOpen ? "\u25BC" : "\u25B6"} Adapter Configuration
          </button>

          {configOpen && (
            <div style={{ marginTop: "10px" }}>
              <table style={tableStyle}>
                <tbody>
                  {Object.entries(adapterConfig).map(([key, value]) => (
                    <tr key={key}>
                      <td style={{ ...tdStyle, fontWeight: 500, width: "40%" }}>{key}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "12px" }}>
                        {maskValue(key, value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: "8px" }}>
                <button
                  onClick={handleValidate}
                  disabled={validating}
                  style={{
                    appearance: "none",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    background: "transparent",
                    color: "inherit",
                    padding: "4px 12px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  {validating ? "Validating..." : "Validate Connection"}
                </button>
                {validationResult && (
                  <span style={{ ...mutedText, marginLeft: "8px", color: validationResult.success ? "#16a34a" : "var(--destructive, #dc2626)" }}>
                    {validationResult.success ? "Connected" : `Failed: ${validationResult.error}`}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
