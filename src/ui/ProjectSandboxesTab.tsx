import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import type { PluginDetailTabProps } from "@paperclipai/plugin-sdk/ui";
import type { Sandbox } from "../types.js";
import { DATA_KEYS } from "../constants.js";
import { layoutStack, rowStyle, mutedText, statusBadge } from "./styles.js";

export function ProjectSandboxesTab(_props: PluginDetailTabProps) {
  const { data: sandboxes, loading, error } = usePluginData<Sandbox[]>(DATA_KEYS.SANDBOX_LIST);

  if (loading) return <div style={mutedText}>Loading sandboxes...</div>;
  if (error) return <div style={mutedText}>Error: {error.message}</div>;

  const list = sandboxes ?? [];
  if (list.length === 0) return <div style={mutedText}>No sandboxes on default gateway.</div>;

  return (
    <div style={layoutStack}>
      {list.map((sb) => (
        <div key={sb.name} style={rowStyle}>
          <span style={{ fontWeight: 500, fontSize: "13px" }}>{sb.name}</span>
          <span style={statusBadge(sb.status)}>{sb.status}</span>
          <span style={mutedText}>{sb.image}</span>
          {sb.gpu && <span style={mutedText}>GPU</span>}
        </div>
      ))}
    </div>
  );
}