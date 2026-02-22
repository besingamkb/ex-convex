import React, { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import type { SchemaDriftDto, TableDiff, FieldDiff } from "../../../shared/types";
import type { ToWebviewMessage } from "../../../shared/messages";
import { onMessage, postMessage } from "../../lib/vscodeApi";
import "./styles.css";

function DriftTimelineApp() {
  const [drift, setDrift] = useState<SchemaDriftDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  useEffect(() => {
    postMessage({ type: "ready" });

    return onMessage((msg: ToWebviewMessage) => {
      switch (msg.type) {
        case "driftDiff":
          setDrift(msg.payload);
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

  const toggleTable = useCallback((table: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(table)) {
        next.delete(table);
      } else {
        next.add(table);
      }
      return next;
    });
  }, []);

  if (loading) {
    return <div className="loading">Loading drift data...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>{error}</p>
        <button onClick={() => postMessage({ type: "refresh" })}>Retry</button>
      </div>
    );
  }

  if (!drift || drift.tableDiffs.length === 0) {
    return (
      <div className="empty-state">
        <p>No schema drift detected between snapshots.</p>
        <button onClick={() => postMessage({ type: "refresh" })}>
          Compare Snapshots
        </button>
      </div>
    );
  }

  const added = drift.tableDiffs.filter((t) => t.change === "added").length;
  const removed = drift.tableDiffs.filter((t) => t.change === "removed").length;
  const modified = drift.tableDiffs.filter((t) => t.change === "modified").length;

  return (
    <div className="drift-container">
      <div className="drift-summary">
        <h3>Schema Drift</h3>
        <p className="summary-text">{drift.summary}</p>
        <div className="summary-counts">
          {added > 0 && <span className="count-badge added">+{added} tables</span>}
          {removed > 0 && <span className="count-badge removed">-{removed} tables</span>}
          {modified > 0 && <span className="count-badge modified">{modified} modified</span>}
        </div>
      </div>

      <div className="diff-list">
        {drift.tableDiffs.map((td) => (
          <TableDiffCard
            key={td.table}
            diff={td}
            expanded={expandedTables.has(td.table)}
            onToggle={() => toggleTable(td.table)}
          />
        ))}
      </div>

      <div className="drift-toolbar">
        <button onClick={() => postMessage({ type: "refresh" })}>Refresh</button>
        <button onClick={() => postMessage({ type: "export", format: "json" })}>
          Export JSON
        </button>
      </div>
    </div>
  );
}

function TableDiffCard({
  diff,
  expanded,
  onToggle,
}: {
  diff: TableDiff;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`table-diff change-${diff.change}`}>
      <div className="table-diff-header" onClick={onToggle}>
        <span className="expand-icon">{expanded ? "▼" : "▶"}</span>
        <span className={`change-badge ${diff.change}`}>{diff.change}</span>
        <span className="diff-table-name">{diff.table}</span>
        <span className="field-count">{diff.fieldDiffs.length} fields</span>
      </div>

      {expanded && (
        <div className="field-diffs">
          {diff.fieldDiffs.map((fd) => (
            <FieldDiffRow key={fd.path} diff={fd} />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldDiffRow({ diff }: { diff: FieldDiff }) {
  return (
    <div className={`field-diff change-${diff.change}`}>
      <span className={`field-change-icon ${diff.change}`}>
        {diff.change === "added" ? "+" : diff.change === "removed" ? "-" : "~"}
      </span>
      <span className="field-path">{diff.path}</span>
      {diff.change === "type_changed" && (
        <span className="type-change">
          <span className="old-type">{diff.oldTypes?.join(" | ")}</span>
          <span className="arrow">→</span>
          <span className="new-type">{diff.newTypes?.join(" | ")}</span>
        </span>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<DriftTimelineApp />);
