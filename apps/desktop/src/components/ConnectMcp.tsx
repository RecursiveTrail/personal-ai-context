import { useEffect, useState } from "react";
import { cursorMcpSnippet } from "../lib/cursorMcpSnippet";
import { mcpConnectInfo, type McpConnectInfo } from "../lib/tauriApi";

export function ConnectMcp() {
  const [info, setInfo] = useState<McpConnectInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void mcpConnectInfo()
      .then((value) => {
        if (!cancelled) {
          setInfo(value);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setInfo(null);
          setError(String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const snippet = info ? cursorMcpSnippet(info) : "";

  const copy = async () => {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <details className="connect-mcp">
      <summary>Connect MCP</summary>
      <div className="connect-mcp-body">
        <p className="connect-lead">Point Cursor at this pack via MCP.</p>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
        {info ? (
          <>
            <pre className="connect-snippet">{snippet}</pre>
            <div className="connect-actions">
              <button type="button" onClick={() => void copy()}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="muted">
              MCP writes stay pending until you Approve them in the desk.
            </p>
          </>
        ) : null}
      </div>
    </details>
  );
}
