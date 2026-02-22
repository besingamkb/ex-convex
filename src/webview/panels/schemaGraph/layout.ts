import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { Node, Edge } from "@xyflow/react";
import type { SchemaGraphDto } from "../../../shared/types";

const elk = new ELK();

const FIELD_ROW_HEIGHT = 22;
const HEADER_HEIGHT = 36;
const NODE_PADDING = 16;
const NODE_WIDTH = 260;

export async function layoutGraph(
  data: SchemaGraphDto
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const elkNodes: ElkNode[] = data.nodes.map((n) => {
    const fieldCount = Math.min(n.fields.length, 15);
    const height = HEADER_HEIGHT + fieldCount * FIELD_ROW_HEIGHT + NODE_PADDING;
    return {
      id: n.id,
      width: NODE_WIDTH,
      height,
    };
  });

  const elkEdges = data.edges.map((e) => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target],
  }));

  const layout = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    },
    children: elkNodes,
    edges: elkEdges,
  });

  const nodes: Node[] = (layout.children ?? []).map((elkNode) => {
    const graphNode = data.nodes.find((n) => n.id === elkNode.id)!;
    return {
      id: elkNode.id,
      type: "tableNode",
      position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
      data: {
        label: graphNode.table,
        fields: graphNode.fields,
        indexCount: graphNode.indexCount,
      },
    };
  });

  const edges: Edge[] = data.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label ?? e.sourceField,
    animated: e.confidence < 0.8,
    style: {
      stroke: e.confidence >= 0.8 ? "var(--vscode-charts-green)" : "var(--vscode-charts-yellow)",
    },
  }));

  return { nodes, edges };
}
