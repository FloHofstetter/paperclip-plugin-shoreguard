import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import type { PluginSidebarProps } from "@paperclipai/plugin-sdk/ui";
import { DATA_KEYS } from "../constants.js";

interface UiConfig { showSidebarLink?: boolean }

export function ShoreGuardSidebarLink({ context }: PluginSidebarProps) {
  const { data: uiCfg } = usePluginData<UiConfig>(DATA_KEYS.UI_CONFIG);
  if (uiCfg && uiCfg.showSidebarLink === false) return null;

  const href = `/${context.companyPrefix}/shoreguard`;
  const isActive = typeof window !== "undefined" && window.location.pathname === href;

  return (
    <a
      href={href}
      aria-current={isActive ? "page" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 12px",
        fontSize: "13px",
        fontWeight: 500,
        textDecoration: "none",
        borderRadius: "6px",
        color: "inherit",
        background: isActive ? "var(--accent, rgba(0,0,0,0.06))" : "transparent",
        opacity: isActive ? 1 : 0.8,
        transition: "background 0.15s, opacity 0.15s",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="2" width="12" height="12" rx="2" />
        <path d="M5 8h6M8 5v6" />
      </svg>
      <span style={{ flex: 1 }}>ShoreGuard</span>
    </a>
  );
}