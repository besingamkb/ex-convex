import * as vscode from "vscode";
import type { IndexCoverageIssue, IndexDefinition } from "../shared/types";

interface QueryUsage {
  filePath: string;
  line: number;
  tableName: string;
  indexName: string | null;
  hasCollect: boolean;
  hasTake: boolean;
  hasFirst: boolean;
  hasFilter: boolean;
  rangeFieldCount: number;
}

/**
 * Analyze Convex query files for index usage patterns.
 * Uses regex-based heuristics for V1. V2 would use ts-morph for full AST.
 */
export async function analyzeIndexCoverage(
  knownIndexes: IndexDefinition[]
): Promise<IndexCoverageIssue[]> {
  const queryFiles = await findConvexQueryFiles();
  const issues: IndexCoverageIssue[] = [];
  const indexMap = buildIndexMap(knownIndexes);

  for (const file of queryFiles) {
    const content = await readFile(file);
    if (!content) {continue;}

    const usages = extractQueryUsages(file.fsPath, content);

    for (const usage of usages) {
      const fileIssues = evaluateUsage(usage, indexMap);
      issues.push(...fileIssues);
    }
  }

  // Sort by severity: high > medium > low
  const severityOrder = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return issues;
}

function extractQueryUsages(
  filePath: string,
  content: string
): QueryUsage[] {
  const usages: QueryUsage[] = [];
  const lines = content.split("\n");

  // Match ctx.db.query("tableName") patterns across lines
  // We look for the start of a query chain and analyze the full chain
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const queryMatch = line.match(
      /(?:ctx|context)\.db\.query\s*\(\s*["'](\w+)["']\s*\)/
    );
    if (!queryMatch) {continue;}

    const tableName = queryMatch[1];

    // Gather the full chain (may span multiple lines)
    let chain = "";
    for (let j = i; j < Math.min(i + 10, lines.length); j++) {
      chain += lines[j];
      // Stop at semicolon, return, or closing paren with semicolon
      if (lines[j].match(/[;]\s*$/) || lines[j].match(/\)\s*;?\s*$/)) {
        break;
      }
    }

    const indexMatch = chain.match(
      /\.withIndex\s*\(\s*["'](\w+)["']/
    );

    // Count range operators in the index callback
    const rangeOps = (chain.match(/\.(?:eq|lt|gt|lte|gte)\s*\(/g) ?? []).length;

    usages.push({
      filePath,
      line: i + 1,
      tableName,
      indexName: indexMatch?.[1] ?? null,
      hasCollect: /\.collect\s*\(/.test(chain),
      hasTake: /\.take\s*\(/.test(chain),
      hasFirst: /\.first\s*\(/.test(chain),
      hasFilter: /\.filter\s*\(/.test(chain),
      rangeFieldCount: rangeOps,
    });
  }

  return usages;
}

function evaluateUsage(
  usage: QueryUsage,
  indexMap: Map<string, IndexDefinition[]>
): IndexCoverageIssue[] {
  const issues: IndexCoverageIssue[] = [];
  const tableIndexes = indexMap.get(usage.tableName) ?? [];

  // Rule 1: Query without .withIndex() — full table scan
  if (!usage.indexName) {
    if (usage.hasCollect) {
      issues.push({
        functionPath: `${usage.filePath}:${usage.line}`,
        table: usage.tableName,
        severity: "high",
        message: `Full table scan: db.query("${usage.tableName}").collect() without an index. This reads every document.`,
        suggestedIndex: tableIndexes.length > 0
          ? `Consider .withIndex("${tableIndexes[0].name}")`
          : `Add an index to "${usage.tableName}" for the fields being queried.`,
      });
    } else if (usage.hasFilter) {
      issues.push({
        functionPath: `${usage.filePath}:${usage.line}`,
        table: usage.tableName,
        severity: "medium",
        message: `Query uses .filter() without .withIndex(). Filter runs in-memory after scanning.`,
        suggestedIndex: `Move filter conditions into a .withIndex() for server-side filtering.`,
      });
    }
    return issues;
  }

  // Rule 2: Referenced index doesn't exist
  const matchedIndex = tableIndexes.find((idx) => idx.name === usage.indexName);
  if (!matchedIndex) {
    issues.push({
      functionPath: `${usage.filePath}:${usage.line}`,
      table: usage.tableName,
      severity: "high",
      message: `Index "${usage.indexName}" referenced but not defined on table "${usage.tableName}".`,
      suggestedIndex: `Define .index("${usage.indexName}", [...]) in schema.ts.`,
    });
    return issues;
  }

  // Rule 3: Collect without bounds after withIndex
  if (usage.hasCollect && usage.rangeFieldCount === 0) {
    issues.push({
      functionPath: `${usage.filePath}:${usage.line}`,
      table: usage.tableName,
      severity: "medium",
      message: `Query uses .withIndex("${usage.indexName}") but no range constraints. This scans the full index.`,
      suggestedIndex: `Add .eq(), .lt(), .gt() etc. in the index range callback.`,
    });
  }

  // Rule 4: .filter() used alongside .withIndex() — possible missed index field
  if (usage.hasFilter) {
    issues.push({
      functionPath: `${usage.filePath}:${usage.line}`,
      table: usage.tableName,
      severity: "low",
      message: `Query uses .filter() after .withIndex("${usage.indexName}"). Consider extending the index to cover filter fields.`,
    });
  }

  return issues;
}

function buildIndexMap(
  indexes: IndexDefinition[]
): Map<string, IndexDefinition[]> {
  const map = new Map<string, IndexDefinition[]>();
  for (const idx of indexes) {
    const list = map.get(idx.table) ?? [];
    list.push(idx);
    map.set(idx.table, list);
  }
  return map;
}

async function findConvexQueryFiles(): Promise<vscode.Uri[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {return [];}

  // Look for .ts/.js files in any convex/ directory (monorepo support)
  const pattern = new vscode.RelativePattern(
    workspaceFolders[0],
    "**/convex/**/*.{ts,tsx,js,jsx}"
  );

  const files = await vscode.workspace.findFiles(
    pattern,
    "**/node_modules/**",
    200
  );

  // Exclude schema.ts and _generated
  return files.filter(
    (f) =>
      !f.fsPath.includes("schema.ts") &&
      !f.fsPath.includes("schema.js") &&
      !f.fsPath.includes("_generated")
  );
}

async function readFile(uri: vscode.Uri): Promise<string | null> {
  try {
    const content = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(content).toString("utf-8");
  } catch {
    return null;
  }
}
