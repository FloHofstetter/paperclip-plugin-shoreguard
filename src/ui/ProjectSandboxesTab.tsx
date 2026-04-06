import { usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import type { PluginDetailTabProps } from "@paperclipai/plugin-sdk/ui";
import type { Sandbox } from "../types.js";
import { DATA_KEYS, ACTION_KEYS } from "../constants.js";
import { layoutStack, tableStyle, thStyle, tdStyle, rowStyle, mutedText, statusBadge, dangerButtonStyle } from "./styles.js";

interface UiConfig { showProjectTab?: boolean }

export function ProjectSandboxesTab(_props: PluginDetailTabProps) {
  const { data: uiCfg } = usePluginData<UiConfig>(DATA_KEYS.UI_CONFIG);
  const { data: sandboxes, loading, error, refresh } = usePluginData<Sandbox[]>(DATA_KEYS.SANDBOX_LIST);
  const deleteSandbox = usePluginAction(ACTION_KEYS.DELETE_SANDBOX);

  if (uiCfg && uiCfg.showProjectTab === false) return null;

  if (loading) return <div style={mutedText}>Loading sandboxes...</div>;
  if (error) return <div style={mutedText}>Error: {error.message}</div>;

  const list = sandboxes ?? [];
  if (list.length === 0) return <div style={mutedText}>No sandboxes on default gateway.</div>;

  const handleDelete = async (name: string) => {
    await deleteSandbox({ name });
    refresh();
  };

  return (
    <div style={layoutStack}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Image</th>
            <th style={thStyle}>Description</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {list.map((sb) => (
            <tr key={sb.name}>
              <td style={tdStyle}>
                <span style={{ fontWeight: 500 }}>{sb.name}</span>
                {sb.labels && Object.keys(sb.labels).length > 0 && (
                  <div style={{ ...mutedText, marginTop: "2px" }}>
                    {Object.entries(sb.labels).map(([k, v]) => `${k}=${v}`).join(", ")}
                  </div>
                )}
              </td>
              <td style={tdStyle}><span style={statusBadge(sb.phase)}>{sb.phase}</span></td>
              <td style={{ ...tdStyle, ...mutedText }}>{sb.image}</td>
              <td style={{ ...tdStyle, ...mutedText }}>{sb.description ?? ""}</td>
              <td style={tdStyle}>
                <button style={dangerButtonStyle} onClick={() => handleDelete(sb.name)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
