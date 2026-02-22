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
  schema?: Record<string, { optional: boolean, type: string }>;
}

function DocumentBrowserApp() {
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizingCol, setResizingCol] = useState<string | null>(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);

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

          // Reset widths for new tables
          setColumnWidths({});
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

  const [isEditingPanel, setIsEditingPanel] = useState(false);
  const [editFormData, setEditFormData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (selectedDoc) {
      setIsEditingPanel(false);
      setEditFormData(selectedDoc as Record<string, unknown>);
    }
  }, [selectedDoc]);

  const handleSaveForm = async () => {
    if (!tableData) return;

    if (!selectedDoc) return;
    const docId = (selectedDoc as any)._id;

    // In a real app we'd diff and send only changed fields, but for simplicity:
    for (const key of Object.keys(editFormData)) {
      if (key === "_id" || key === "_creationTime") continue;
      if (editFormData[key] !== (selectedDoc as any)[key]) {
        postMessage({
          type: "updateDocument",
          payload: {
            table: tableData.table,
            id: docId,
            field: key,
            value: editFormData[key],
          },
        });
      }
    }
    setIsEditingPanel(false);
  };

  const handleResizeStart = (e: React.MouseEvent, col: string) => {
    e.stopPropagation();
    setResizingCol(col);
    setStartX(e.clientX);
    setStartWidth(columnWidths[col] || 200); // Default width 200px
  };

  useEffect(() => {
    if (!resizingCol) { return; }

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      const newWidth = Math.max(50, startWidth + diff); // Minimum width 50px
      setColumnWidths((prev) => ({ ...prev, [resizingCol]: newWidth }));
    };

    const handleMouseUp = () => {
      setResizingCol(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingCol, startX, startWidth]);

  const filteredDocs = tableData?.docs.filter((doc) => {
    if (!searchTerm) { return true; }
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
    return (
      <div className="center-message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
        <span>Loading documents...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="center-message error">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <p>{error}</p>
        <button onClick={() => postMessage({ type: "refresh" })}>Try Again</button>
      </div>
    );
  }

  if (!tableData) {
    return (
      <div className="center-message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="3" y1="9" x2="21" y2="9"></line>
          <line x1="9" y1="21" x2="9" y2="9"></line>
        </svg>
        <span>Select a table from the sidebar to view data.</span>
      </div>
    );
  }

  return (
    <div className="browser-container">
      <div className="browser-header">
        <h2 className="table-title">{tableData.table}</h2>
        <span className="doc-count">{tableData.totalCount.toLocaleString()} docs</span>

        <div className="search-wrapper">
          <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            className="search-input"
            type="text"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
          />
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button className="refresh-btn" onClick={handleRefresh}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="browser-body">
        <div className={`table-panel ${selectedDoc ? "with-detail" : ""}`}>
          <table className="data-table">
            <thead>
              <tr>
                <th className="sticky-col" style={{ width: 50, minWidth: 50, maxWidth: 50 }}>#</th>
                {columns.map((col) => {
                  const widthStyle = columnWidths[col] ? { width: columnWidths[col], minWidth: columnWidths[col], maxWidth: columnWidths[col] } : { width: 200, minWidth: 200, maxWidth: 200 };
                  return (
                    <th key={col} style={widthStyle}>
                      {col}
                      <div
                        className={`resizer ${resizingCol === col ? "is-resizing" : ""}`}
                        onMouseDown={(e) => handleResizeStart(e, col)}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pagedDocs.map((doc, i) => (
                <tr
                  key={(doc as any)._id ?? i}
                  className={selectedDoc === doc ? "selected" : ""}
                  onClick={() => setSelectedDoc(doc)}
                >
                  <td className="row-number-cell sticky-col" style={{ width: 50, minWidth: 50, maxWidth: 50, color: 'var(--vscode-descriptionForeground)' }}>
                    {page * pageSize + i + 1}
                  </td>
                  {columns.map((col) => {
                    const widthStyle = columnWidths[col] ? { width: columnWidths[col], minWidth: columnWidths[col], maxWidth: columnWidths[col] } : { width: 200, minWidth: 200, maxWidth: 200 };
                    return (
                      <td key={col} className={col === "_id" ? "field-id" : ""} style={widthStyle}>
                        {formatCell((doc as any)[col])}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
              <span>{page + 1} of {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </div>

        {(selectedDoc) && (() => {
          // Check if form is valid (no required fields are empty "")
          let isFormValid = true;
          if (tableData?.schema) {
            for (const col of columns) {
              if (col === "_id" || col === "_creationTime") continue;

              const fieldSchema = tableData.schema[col];
              if (fieldSchema && !fieldSchema.optional) {
                const val = editFormData[col];
                if (val === "" || val === undefined || val === null) {
                  isFormValid = false;
                  break;
                }
              }
            }
          }

          return (
            <div className="detail-panel">
              <div className="detail-header">
                <div className="detail-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  <span>{isEditingPanel ? "Edit Document" : "Document Detail"}</span>
                </div>
                <div className="detail-actions">
                  {isEditingPanel ? (
                    <>
                      <button onClick={() => { setIsEditingPanel(false); setEditFormData(selectedDoc as any); }}>Cancel</button>
                      <button
                        className="primary"
                        onClick={handleSaveForm}
                      >
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="primary" onClick={() => setIsEditingPanel(true)}>Edit</button>
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
                    </>
                  )}
                </div>
              </div>

              {(isEditingPanel) ? (
                <div className="detail-form">
                  {columns.map(key => {
                    const val = editFormData[key];
                    const isReadOnly = (key === "_id" || key === "_creationTime");

                    return (
                      <div key={key} className="form-group">
                        <label>
                          {key}
                          {tableData?.schema?.[key] && !tableData.schema[key].optional && (
                            <span style={{ color: "var(--vscode-errorForeground)", marginLeft: "4px" }}>*</span>
                          )}
                        </label>
                        {isReadOnly ? (
                          <div className="read-only-val">{String(val)}</div>
                        ) : (
                          <input
                            type={typeof val === "number" ? "number" : typeof val === "boolean" ? "checkbox" : "text"}
                            className="form-input"
                            checked={typeof val === "boolean" ? (val as boolean) : undefined}
                            value={typeof val === "boolean" ? undefined : typeof val === "string" || typeof val === "number" ? val : (val !== null && val !== undefined ? JSON.stringify(val) : "")}
                            onChange={(e) => {
                              let newVal: unknown = e.target.value;

                              // If we know this field should be a number (either current value is a number or it's a number input)
                              if (typeof val === "number" || e.target.type === "number") {
                                newVal = e.target.value === "" ? 0 : Number(e.target.value);
                              } else if (typeof val === "boolean" || e.target.type === "checkbox") {
                                newVal = e.target.checked;
                              } else if (e.target.value === "true") {
                                newVal = true;
                              } else if (e.target.value === "false") {
                                newVal = false;
                              } else if (typeof val === "object" && val !== null) {
                                try {
                                  newVal = JSON.parse(e.target.value);
                                } catch {
                                  // If it doesn't parse, store the string as they type so we don't break the input completely
                                  newVal = e.target.value;
                                }
                              }

                              setEditFormData(prev => ({ ...prev, [key]: newVal }));
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <pre className="detail-json">
                  {JSON.stringify(selectedDoc, null, 2)}
                </pre>
              )}
            </div>
          );
        })()}
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
  if (value === null || value === undefined) { return "—"; }
  if (typeof value === "boolean") { return value ? "true" : "false"; }
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
