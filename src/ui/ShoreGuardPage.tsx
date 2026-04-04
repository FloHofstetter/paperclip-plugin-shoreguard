import { useState } from "react";
import { usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import type { PluginPageProps } from "@paperclipai/plugin-sdk/ui";
import type { Gateway, Sandbox, ApprovalChunk } from "../types.js";
import { DATA_KEYS, ACTION_KEYS } from "../constants.js";
import {
  layoutStack,
  rowStyle,
  cardStyle,
  tableStyle,
  thStyle,
  tdStyle,
  tabBarStyle,
  tabStyle,
  buttonStyle,
  dangerButtonStyle,
  successButtonStyle,
  mutedText,
  statusBadge,
} from "./styles.js";

type Tab = "gateways" | "sandboxes" | "approvals";

export function ShoreGuardPage(_props: PluginPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>("gateways");

  return (
    <div style={layoutStack}>
      <h2 style={{ margin: 0, fontSize: "18px" }}>ShoreGuard</h2>

      <div style={tabBarStyle}>
        {(["gateways", "sandboxes", "approvals"] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            style={tabStyle(activeTab === tab)}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === "gateways" && <GatewaysTab />}
      {activeTab === "sandboxes" && <SandboxesTab />}
      {activeTab === "approvals" && <ApprovalsTab />}
    </div>
  );
}

function GatewaysTab() {
  const { data: gateways, loading, error } = usePluginData<Gateway[]>(DATA_KEYS.GATEWAY_HEALTH);

  if (loading) return <div style={mutedText}>Loading...</div>;
  if (error) return <div style={mutedText}>Error: {error.message}</div>;

  const list = gateways ?? [];
  if (list.length === 0) return <div style={mutedText}>No gateways registered.</div>;

  return (
    <div style={cardStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Endpoint</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Labels</th>
          </tr>
        </thead>
        <tbody>
          {list.map((gw) => (
            <tr key={gw.name}>
              <td style={{ ...tdStyle, fontWeight: 500 }}>{gw.name}</td>
              <td style={tdStyle}>{gw.endpoint}</td>
              <td style={tdStyle}>
                <span style={statusBadge(gw.status)}>{gw.status}</span>
              </td>
              <td style={tdStyle}>
                {gw.labels
                  ? Object.entries(gw.labels)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(", ")
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SandboxesTab() {
  const { data: sandboxes, loading, error, refresh } = usePluginData<Sandbox[]>(
    DATA_KEYS.SANDBOX_LIST,
  );
  const deleteSandbox = usePluginAction(ACTION_KEYS.DELETE_SANDBOX);

  if (loading) return <div style={mutedText}>Loading...</div>;
  if (error) return <div style={mutedText}>Error: {error.message}</div>;

  const list = sandboxes ?? [];
  if (list.length === 0) return <div style={mutedText}>No sandboxes on default gateway.</div>;

  async function handleDelete(name: string) {
    if (!confirm(`Delete sandbox "${name}"?`)) return;
    await deleteSandbox({ name });
    refresh();
  }

  return (
    <div style={cardStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Image</th>
            <th style={thStyle}>GPU</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {list.map((sb) => (
            <tr key={sb.name}>
              <td style={{ ...tdStyle, fontWeight: 500 }}>{sb.name}</td>
              <td style={tdStyle}>
                <span style={statusBadge(sb.status)}>{sb.status}</span>
              </td>
              <td style={tdStyle}>{sb.image}</td>
              <td style={tdStyle}>{sb.gpu ? "Yes" : "No"}</td>
              <td style={tdStyle}>
                <button
                  type="button"
                  style={dangerButtonStyle}
                  onClick={() => void handleDelete(sb.name)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalsTab() {
  const {
    data: approvals,
    loading,
    error,
    refresh,
  } = usePluginData<Array<ApprovalChunk & { sandbox: string }>>(DATA_KEYS.PENDING_APPROVALS);
  const approveChunk = usePluginAction(ACTION_KEYS.APPROVE_CHUNK);
  const rejectChunk = usePluginAction(ACTION_KEYS.REJECT_CHUNK);

  if (loading) return <div style={mutedText}>Loading...</div>;
  if (error) return <div style={mutedText}>Error: {error.message}</div>;

  const list = approvals ?? [];
  if (list.length === 0) return <div style={mutedText}>No pending approvals.</div>;

  async function handleApprove(sandbox: string, chunkId: string) {
    await approveChunk({ sandbox, chunkId });
    refresh();
  }

  async function handleReject(sandbox: string, chunkId: string) {
    const reason = prompt("Rejection reason (optional):");
    await rejectChunk({ sandbox, chunkId, reason: reason ?? "" });
    refresh();
  }

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      {list.map((chunk) => (
        <div key={chunk.chunk_id} style={cardStyle}>
          <div style={rowStyle}>
            <span style={{ fontWeight: 500, fontSize: "13px" }}>{chunk.sandbox}</span>
            {chunk.security_flagged && (
              <span style={statusBadge("flagged")}>Security Flagged</span>
            )}
          </div>
          <pre
            style={{
              fontSize: "11px",
              margin: "8px 0",
              padding: "8px",
              background: "var(--background, #f5f5f5)",
              borderRadius: "6px",
              overflow: "auto",
              maxHeight: "120px",
            }}
          >
            {JSON.stringify(chunk.proposed_rule, null, 2)}
          </pre>
          <div style={rowStyle}>
            <button
              type="button"
              style={successButtonStyle}
              onClick={() => void handleApprove(chunk.sandbox, chunk.chunk_id)}
            >
              Approve
            </button>
            <button
              type="button"
              style={dangerButtonStyle}
              onClick={() => void handleReject(chunk.sandbox, chunk.chunk_id)}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}