import React, { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import type { IndexCoverageIssue } from "../../../shared/types";
import type { ToWebviewMessage } from "../../../shared/messages";
import { onMessage, postMessage } from "../../lib/vscodeApi";
import "./styles.css";

function IndexInspectorApp() {
  const [findings, setFindings] = useState<IndexCoverageIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");

  useEffect(() => {
    postMessage({ type: "ready" });

    return onMessage((msg: ToWebviewMessage) => {
      switch (msg.type) {
        case "indexFindings":
          setFindings(msg.payload);
          setLoading(false);
          setError(null);
          break;
        case "loading":
          setLoading(true);
          break;
        case "error":
          setError(msg.payload.message);
          setLoading(false);
          break;
      }
    });
  }, []);

  const filtered =
    filter === "all" ? findings : findings.filter((f) => f.severity === filter);

  const openFile = useCallback((path: string) => {
    postMessage({ type: "openFile", path });
  }, []);

  if (loading) {
    return <div className="loading">Analyzing index coverage...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>{error}</p>
        <button onClick={() => postMessage({ type: "refresh" })}>Retry</button>
      </div>
    );
  }

  const highCount = findings.filter((f) => f.severity === "high").length;
  const medCount = findings.filter((f) => f.severity === "medium").length;
  const lowCount = findings.filter((f) => f.severity === "low").length;

  return (
    <div className="inspector-container">
      <div className="summary-bar">
        <span className="summary-total">{findings.length} findings</span>
        <span className="severity-count high">{highCount} high</span>
        <span className="severity-count medium">{medCount} medium</span>
        <span className="severity-count low">{lowCount} low</span>
      </div>

      <div className="filter-bar">
        {(["all", "high", "medium", "low"] as const).map((level) => (
          <button
            key={level}
            className={`filter-btn ${filter === level ? "active" : ""}`}
            onClick={() => setFilter(level)}
          >
            {level}
          </button>
        ))}
        <button
          className="refresh-btn"
          onClick={() => postMessage({ type: "refresh" })}
        >
          Refresh
        </button>
      </div>

      <div className="findings-list">
        {filtered.map((issue, i) => (
          <div key={i} className={`finding-card severity-${issue.severity}`}>
            <div className="finding-header">
              <span className={`severity-badge ${issue.severity}`}>
                {issue.severity.toUpperCase()}
              </span>
              <span className="finding-table">{issue.table}</span>
            </div>
            <p className="finding-message">{issue.message}</p>
            <div className="finding-meta">
              <button
                className="file-link"
                onClick={() => openFile(issue.functionPath)}
              >
                {issue.functionPath}
              </button>
              {issue.suggestedIndex && (
                <code className="suggested-index">{issue.suggestedIndex}</code>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="empty-state">
            {findings.length === 0
              ? "No index coverage issues found."
              : "No findings match the selected filter."}
          </div>
        )}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<IndexInspectorApp />);
