import { useState } from "react";
import { usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import type { PluginSettingsPageProps } from "@paperclipai/plugin-sdk/ui";
import type { SandboxTemplate } from "../types.js";
import { DATA_KEYS, ACTION_KEYS } from "../constants.js";
import { layoutStack, cardStyle, rowStyle, buttonStyle, mutedText, statusBadge } from "./styles.js";

interface ConnectionResult {
  success: boolean;
  health?: { status: string };
  ready?: { status: string };
  error?: string;
}

export function ShoreGuardSettingsPage(_props: PluginSettingsPageProps) {
  const { data: templates } = usePluginData<SandboxTemplate[]>(DATA_KEYS.TEMPLATES);
  const testConnection = usePluginAction(ACTION_KEYS.TEST_CONNECTION);
  const generateConfig = usePluginAction(ACTION_KEYS.GENERATE_ADAPTER_CONFIG);
  const [testResult, setTestResult] = useState<ConnectionResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [generatedConfig, setGeneratedConfig] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = (await testConnection()) as ConnectionResult;
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: String(err) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={layoutStack}>
      <h3 style={{ margin: 0, fontSize: "16px" }}>ShoreGuard Connection</h3>

      <div style={cardStyle}>
        <div style={layoutStack}>
          <div style={mutedText}>
            Configure ShoreGuard URL and API key in the plugin configuration above. Use the button
            below to verify connectivity.
          </div>

          <div style={rowStyle}>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => void handleTestConnection()}
              disabled={testing}
            >
              {testing ? "Testing..." : "Test Connection"}
            </button>
          </div>

          {testResult && (
            <div style={rowStyle}>
              <span style={statusBadge(testResult.success ? "ok" : "error")}>
                {testResult.success ? "Connected" : "Failed"}
              </span>
              {testResult.error && (
                <span style={{ fontSize: "12px", color: "var(--destructive, #dc2626)" }}>
                  {testResult.error}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <h3 style={{ margin: 0, fontSize: "16px" }}>Adapter Config Template</h3>

      <div style={cardStyle}>
        <div style={layoutStack}>
          <div style={mutedText}>
            Generate a JSON config template for agents using the openshell_shoreguard adapter.
            Copy and set via the Paperclip API.
          </div>

          <div style={rowStyle}>
            <button
              type="button"
              style={buttonStyle}
              onClick={async () => {
                const result = (await generateConfig()) as { config?: string; error?: string };
                if (result?.config) {
                  setGeneratedConfig(result.config);
                  setCopied(false);
                }
              }}
            >
              Generate Config
            </button>
          </div>

          {generatedConfig && (
            <div>
              <pre
                style={{
                  background: "var(--muted, #1a1a2e)",
                  padding: "12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  overflow: "auto",
                  maxHeight: "200px",
                }}
              >
                {generatedConfig}
              </pre>
              <button
                type="button"
                style={{ ...buttonStyle, marginTop: "6px" }}
                onClick={() => {
                  navigator.clipboard.writeText(generatedConfig);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Copied!" : "Copy to Clipboard"}
              </button>
            </div>
          )}
        </div>
      </div>

      <h3 style={{ margin: 0, fontSize: "16px" }}>Available Templates</h3>

      <div style={cardStyle}>
        {!templates || templates.length === 0 ? (
          <div style={mutedText}>No templates available (connect to ShoreGuard first).</div>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {templates.map((tmpl) => (
              <div key={tmpl.name} style={rowStyle}>
                <span style={{ fontWeight: 500, fontSize: "13px" }}>{tmpl.name}</span>
                {tmpl.description && <span style={mutedText}>{tmpl.description}</span>}
                {tmpl.image && (
                  <span style={{ ...mutedText, fontFamily: "monospace" }}>{tmpl.image}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}