import type { CSSProperties } from "react";

export const layoutStack: CSSProperties = {
  display: "grid",
  gap: "12px",
};

export const cardStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "14px",
  background: "var(--card, transparent)",
};

export const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "8px",
};

export const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  background: "transparent",
  color: "inherit",
  padding: "6px 12px",
  fontSize: "12px",
  cursor: "pointer",
};

export const dangerButtonStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: "color-mix(in srgb, var(--destructive, #dc2626) 60%, var(--border))",
  color: "var(--destructive, #dc2626)",
};

export const successButtonStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: "color-mix(in srgb, #16a34a 60%, var(--border))",
  color: "#16a34a",
};

export const mutedText: CSSProperties = {
  fontSize: "12px",
  opacity: 0.72,
  lineHeight: 1.45,
};

export const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "13px",
};

export const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid var(--border)",
  fontWeight: 600,
  fontSize: "11px",
  textTransform: "uppercase",
  opacity: 0.6,
};

export const tdStyle: CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--border)",
};

export const tabBarStyle: CSSProperties = {
  display: "flex",
  gap: "0",
  borderBottom: "1px solid var(--border)",
  marginBottom: "12px",
};

export function tabStyle(active: boolean): CSSProperties {
  return {
    appearance: "none",
    border: "none",
    background: "transparent",
    color: "inherit",
    padding: "8px 16px",
    fontSize: "13px",
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
    borderBottom: active ? "2px solid var(--foreground)" : "2px solid transparent",
    opacity: active ? 1 : 0.6,
  };
}

export function statusBadge(status: string): CSSProperties {
  const isOk = ["ok", "running", "connected", "healthy", "ready"].includes(status.toLowerCase());
  const color = isOk ? "#16a34a" : "var(--destructive, #dc2626)";
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 600,
    background: `color-mix(in srgb, ${color} 18%, transparent)`,
    color,
    border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
  };
}