import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import type { PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import type { Gateway } from "../types.js";
import { DATA_KEYS } from "../constants.js";
import { layoutStack, rowStyle, mutedText, statusBadge } from "./styles.js";

interface UiConfig { showDashboardWidget?: boolean }

export function GatewayHealthWidget(_props: PluginWidgetProps) {
  const { data: uiCfg } = usePluginData<UiConfig>(DATA_KEYS.UI_CONFIG);
  const { data: gateways, loading, error } = usePluginData<Gateway[]>(DATA_KEYS.GATEWAY_HEALTH);

  if (uiCfg && uiCfg.showDashboardWidget === false) return null;

  if (loading) return <div style={mutedText}>Loading gateways...</div>;
  if (error) return <div style={mutedText}>Error: {error.message}</div>;

  const list = gateways ?? [];
  const connected = list.filter((g) => g.status?.toLowerCase() === "ok").length;

  return (
    <div style={layoutStack}>
      <div style={rowStyle}>
        <strong>ShoreGuard</strong>
        <span style={mutedText}>
          {list.length} gateway{list.length !== 1 ? "s" : ""}
        </span>
      </div>

      {list.length === 0 ? (
        <div style={mutedText}>No gateways registered</div>
      ) : (
        <>
          <div style={mutedText}>
            {connected}/{list.length} connected
          </div>
          <div style={{ display: "grid", gap: "6px" }}>
            {list.map((gw) => (
              <div key={gw.name} style={rowStyle}>
                <span style={{ fontSize: "13px", fontWeight: 500 }}>{gw.name}</span>
                <span style={statusBadge(gw.status)}>{gw.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}