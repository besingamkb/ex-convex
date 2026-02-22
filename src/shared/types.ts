// Shared DTOs and interfaces for the ExConvex extension.
// Source of truth: local_dumps/02-convex-db-visualizer-v1-spec.md

export type DeploymentEnv = "local" | "dev";

export interface DeploymentTarget {
  id: string;
  env: DeploymentEnv;
  url?: string;
  projectName?: string;
  connectedAt: number;
}

export interface FieldStat {
  path: string;
  types: string[];
  optionalRate: number;
  sampleCount: number;
  confidence: number;
}

export interface TableSchema {
  table: string;
  fields: FieldStat[];
  sampledDocs: number;
  inferredAt: number;
}

export interface RelationEdge {
  fromTable: string;
  fromFieldPath: string;
  toTable: string;
  confidence: number;
  source: "inferred" | "manual";
}

export interface IndexDefinition {
  table: string;
  name: string;
  fields: string[];
  type: "by_field" | "search" | "vector";
}

export interface IndexCoverageIssue {
  functionPath: string;
  table: string;
  severity: "high" | "medium" | "low";
  message: string;
  suggestedIndex?: string;
}

export interface SchemaSnapshot {
  id: string;
  deploymentId: string;
  createdAt: number;
  tables: TableSchema[];
  relations: RelationEdge[];
}

export interface QueryWatchUpdate {
  queryName: string;
  table: string;
  timestamp: number;
  resultCount: number;
  results: unknown[];
  durationMs: number;
}

// Schema graph DTOs for webview rendering
export interface SchemaGraphNode {
  id: string;
  table: string;
  fields: FieldStat[];
  indexCount: number;
}

export interface SchemaGraphEdge {
  id: string;
  source: string;
  target: string;
  sourceField: string;
  confidence: number;
  label?: string;
}

export interface SchemaGraphDto {
  nodes: SchemaGraphNode[];
  edges: SchemaGraphEdge[];
}

// Drift diff DTOs
export interface FieldDiff {
  path: string;
  change: "added" | "removed" | "type_changed";
  oldTypes?: string[];
  newTypes?: string[];
}

export interface TableDiff {
  table: string;
  change: "added" | "removed" | "modified";
  fieldDiffs: FieldDiff[];
}

export interface SchemaDriftDto {
  fromSnapshotId: string;
  toSnapshotId: string;
  tableDiffs: TableDiff[];
  summary: string;
}

export interface RelationOverrideDto {
  fromTable: string;
  fromFieldPath: string;
  toTable: string;
  action: "add" | "remove";
}
