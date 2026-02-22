// Webview <-> Extension host message contracts.
// Source of truth: local_dumps/03-convex-db-visualizer-tech-stack.md

import type {
  SchemaGraphDto,
  IndexCoverageIssue,
  QueryWatchUpdate,
  SchemaDriftDto,
  RelationOverrideDto,
} from "./types";

// Messages sent from extension host to webview
export type ToWebviewMessage =
  | { type: "schemaGraphData"; payload: SchemaGraphDto }
  | { type: "indexFindings"; payload: IndexCoverageIssue[] }
  | { type: "watchUpdate"; payload: QueryWatchUpdate }
  | { type: "driftDiff"; payload: SchemaDriftDto }
  | { type: "loading"; payload: { message: string } }
  | { type: "error"; payload: { message: string } };

// Messages sent from webview to extension host
export type FromWebviewMessage =
  | { type: "openFile"; path: string; line?: number }
  | { type: "refresh" }
  | { type: "export"; format: "json" | "svg" | "png" }
  | { type: "setRelationOverride"; payload: RelationOverrideDto }
  | { type: "ready" };
