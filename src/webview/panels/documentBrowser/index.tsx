import React, { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { onMessage, postMessage } from "../../lib/vscodeApi";
import "./styles.css";

interface DocBrowserMessage {
  type: string;
  payload?: unknown;
}

interface TableData {
  table: string;
  docs: Record<string, unknown>[];
  totalCount: number;
  fieldOrder?: string[];
}

function DocumentBrowserApp() {
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    postMessage({ type: "ready" });

    return onMessage((msg: DocBrowserMessage) => {
      switch (msg.type) {
        case "tableData": {
          const data = msg.payload as TableData;
          setTableData(data);
          setSelectedDoc(null);
          setLoading(false);
          setError(null);
          setPage(0);
          break;
        }
        case "loading":
          setLoading(true);
          setError(null);
          break;
        case "error":
          setError((msg.payload as { message: string }).message);
          setLoading(false);
          break;
      }
    });
  }, []);

  const filteredDocs = tableData?.docs.filter((doc) => {
    if (!searchTerm) {return true;}
    const str = JSON.stringify(doc).toLowerCase();
    return str.includes(searchTerm.toLowerCase());
  }) ?? [];

  const pagedDocs = filteredDocs.slice(
    page * pageSize,
    (page + 1) * pageSize
  );

  const totalPages = Math.ceil(filteredDocs.length / pageSize);

  const columns = tableData?.docs.length
    ? getColumns(tableData.docs, tableData.fieldOrder)
    : [];

  const handleRefresh = useCallback(() => {
    if (tableData) {
      postMessage({ type: "openFile", path: tableData.table } as any);
    }
  }, [tableData]);

  if (loading) {
    return <div className="center-message">Loading documents...</div>;
  }

  if (error) {
    return (
      <div className="center-message error">
        <p>{error}</p>
        <button onClick={() => postMessage({ type: "refresh" })}>Retry</button>
      </div>
    );
  }

  if (!tableData) {
    return (
      <div className="center-message">
        Select a table from the sidebar to browse documents.
      </div>
    );
  }

  return (
    <div className="browser-container">
      <div className="browser-header">
        <h2 className="table-title">{tableData.table}</h2>
        <span className="doc-count">{tableData.totalCount} documents</span>
        <input
          className="search-input"
          type="text"
          placeholder="Search documents..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
        />
        <button className="refresh-btn" onClick={handleRefresh}>Refresh</button>
      </div>

      <div className="browser-body">
        <div className={`table-panel ${selectedDoc ? "with-detail" : ""}`}>
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedDocs.map((doc, i) => (
                <tr
                  key={(doc as any)._id ?? i}
                  className={selectedDoc === doc ? "selected" : ""}
                  onClick={() => setSelectedDoc(doc)}
                >
                  {columns.map((col) => (
                    <td key={col}>{formatCell((doc as any)[col])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
              <span>{page + 1} / {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </div>

        {selectedDoc && (
          <div className="detail-panel">
            <div className="detail-header">
              <span>Document Detail</span>
              <div className="detail-actions">
                <button
                  onClick={() => {
                    postMessage({
                      type: "export",
                      format: "json",
                    });
                  }}
                >
                  Copy JSON
                </button>
                <button onClick={() => setSelectedDoc(null)}>Close</button>
              </div>
            </div>
            <pre className="detail-json">
              {JSON.stringify(selectedDoc, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function getColumns(docs: Record<string, unknown>[], fieldOrder?: string[]): string[] {
  // Use the schema field order when available.
  // Layout: _id, then schema fields in definition order, then _creationTime last.
  const seen = new Set<string>();
  const ordered: string[] = [];

  // _id always first
  seen.add("_id");
  ordered.push("_id");

  // Reserve _creationTime — we'll push it to the end
  seen.add("_creationTime");

  // Add fields in schema definition order
  if (fieldOrder) {
    for (const field of fieldOrder) {
      if (!seen.has(field)) {
        seen.add(field);
        ordered.push(field);
      }
    }
  }

  // Append any extra fields found in docs that aren't in the schema
  for (const doc of docs.slice(0, 20)) {
    for (const key of Object.keys(doc)) {
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(key);
      }
    }
  }

  // _creationTime always last
  ordered.push("_creationTime");

  return ordered;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {return "—";}
  if (typeof value === "boolean") {return value ? "true" : "false";}
  if (typeof value === "number") {
    // Check if it looks like a timestamp (ms since epoch)
    if (value > 1_000_000_000_000 && value < 2_000_000_000_000) {
      return new Date(value).toLocaleString();
    }
    return String(value);
  }
  if (typeof value === "string") {
    return value.length > 60 ? value.slice(0, 60) + "…" : value;
  }
  if (typeof value === "object") {
    const str = JSON.stringify(value);
    return str.length > 60 ? str.slice(0, 60) + "…" : str;
  }
  return String(value);
}

const root = createRoot(document.getElementById("root")!);
root.render(<DocumentBrowserApp />);
