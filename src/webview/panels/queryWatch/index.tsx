import React, { useEffect, useState, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { QueryWatchUpdate } from "../../../shared/types";
import type { ToWebviewMessage } from "../../../shared/messages";
import { onMessage, postMessage } from "../../lib/vscodeApi";
import "./styles.css";

function QueryWatchApp() {
  const [updates, setUpdates] = useState<QueryWatchUpdate[]>([]);
  const [watching, setWatching] = useState(false);
  const [selectedUpdate, setSelectedUpdate] = useState<QueryWatchUpdate | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    postMessage({ type: "ready" });

    return onMessage((msg: ToWebviewMessage) => {
      switch (msg.type) {
        case "watchUpdate":
          setUpdates((prev) => {
            const next = [msg.payload, ...prev].slice(0, 200);
            return next;
          });
          setWatching(true);
          break;
        case "loading":
          setWatching(true);
          break;
        case "error":
          setWatching(false);
          break;
      }
    });
  }, []);

  const handleClear = useCallback(() => {
    setUpdates([]);
    setSelectedUpdate(null);
  }, []);

  return (
    <div className="watch-container">
      <div className="watch-toolbar">
        <span className={`watch-status ${watching ? "active" : "inactive"}`}>
          {watching ? "Watching" : "Idle"}
        </span>
        <span className="update-count">{updates.length} updates</span>
        <button onClick={handleClear}>Clear</button>
        <button onClick={() => postMessage({ type: "refresh" })}>
          {watching ? "Stop" : "Start"}
        </button>
      </div>

      <div className="watch-content">
        <div className="update-list" ref={listRef}>
          {updates.map((update, i) => (
            <div
              key={`${update.timestamp}-${i}`}
              className={`update-row ${selectedUpdate === update ? "selected" : ""}`}
              onClick={() => setSelectedUpdate(update)}
            >
              <span className="update-time">
                {new Date(update.timestamp).toLocaleTimeString()}
              </span>
              <span className="update-query">{update.queryName}</span>
              <span className="update-table">{update.table}</span>
              <span className="update-count-badge">
                {update.resultCount} rows
              </span>
              <span className="update-duration">{update.durationMs}ms</span>
            </div>
          ))}
          {updates.length === 0 && (
            <div className="empty-state">
              No query updates yet. Use "ExConvex: Watch Query Function" to start watching.
            </div>
          )}
        </div>

        {selectedUpdate && (
          <div className="detail-panel">
            <div className="detail-header">
              <span>{selectedUpdate.queryName}</span>
              <button onClick={() => setSelectedUpdate(null)}>Close</button>
            </div>
            <pre className="detail-json">
              {JSON.stringify(selectedUpdate.results, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<QueryWatchApp />);
