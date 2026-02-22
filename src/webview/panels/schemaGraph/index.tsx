import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { SchemaGraphDto } from "../../../shared/types";
import type { ToWebviewMessage } from "../../../shared/messages";
import { onMessage, postMessage } from "../../lib/vscodeApi";
import { TableNode } from "./TableNode";
import { layoutGraph } from "./layout";
import "./styles.css";

const nodeTypes = { tableNode: TableNode };

function SchemaGraphApp() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    postMessage({ type: "ready" });

    return onMessage((msg: ToWebviewMessage) => {
      switch (msg.type) {
        case "schemaGraphData":
          applyGraphData(msg.payload);
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

  const applyGraphData = useCallback(async (data: SchemaGraphDto) => {
    const { nodes: layoutNodes, edges: layoutEdges } = await layoutGraph(data);
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, []);

  const handleRefresh = useCallback(() => {
    postMessage({ type: "refresh" });
  }, []);

  const handleExport = useCallback((format: "json" | "svg" | "png") => {
    postMessage({ type: "export", format });
  }, []);

  if (error) {
    return (
      <div className="error-container">
        <p>Error: {error}</p>
        <button onClick={handleRefresh}>Retry</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-container">
        <p>Loading schema graph...</p>
      </div>
    );
  }

  return (
    <div className="graph-container">
      <div className="toolbar">
        <button onClick={handleRefresh}>Refresh</button>
        <button onClick={() => handleExport("json")}>Export JSON</button>
        <button onClick={() => handleExport("svg")}>Export SVG</button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<SchemaGraphApp />);
