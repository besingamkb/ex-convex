import type { FieldStat, TableSchema, RelationEdge } from "../shared/types";

/**
 * Infer schema from sampled documents.
 * Used to supplement or validate schema.ts parsing.
 */
export function inferSchemaFromDocs(
  tableName: string,
  docs: Record<string, unknown>[]
): { schema: TableSchema; relations: RelationEdge[] } {
  if (docs.length === 0) {
    return {
      schema: {
        table: tableName,
        fields: [],
        sampledDocs: 0,
        inferredAt: Date.now(),
      },
      relations: [],
    };
  }

  const fieldMap = new Map<
    string,
    { types: Set<string>; presentCount: number }
  >();

  for (const doc of docs) {
    flattenDoc(doc, "", fieldMap);
  }

  const fields: FieldStat[] = [];
  const relations: RelationEdge[] = [];
  const total = docs.length;

  for (const [path, stats] of fieldMap) {
    const types = Array.from(stats.types);
    const optionalRate = 1 - stats.presentCount / total;
    const confidence = Math.min(stats.presentCount / Math.max(total, 10), 1);

    fields.push({
      path,
      types,
      optionalRate,
      sampleCount: stats.presentCount,
      confidence,
    });

    // Detect id-like fields that reference other tables
    if (isIdLikeField(path, types)) {
      const targetTable = guessTargetTable(path);
      if (targetTable) {
        relations.push({
          fromTable: tableName,
          fromFieldPath: path,
          toTable: targetTable,
          confidence: 0.6,
          source: "inferred",
        });
      }
    }
  }

  // Sort fields: _id first, _creationTime second, then alphabetical
  fields.sort((a, b) => {
    if (a.path === "_id") {return -1;}
    if (b.path === "_id") {return 1;}
    if (a.path === "_creationTime") {return -1;}
    if (b.path === "_creationTime") {return 1;}
    return a.path.localeCompare(b.path);
  });

  return {
    schema: {
      table: tableName,
      fields,
      sampledDocs: total,
      inferredAt: Date.now(),
    },
    relations,
  };
}

function flattenDoc(
  obj: unknown,
  prefix: string,
  result: Map<string, { types: Set<string>; presentCount: number }>
): void {
  if (obj === null || obj === undefined) {
    return;
  }

  if (typeof obj !== "object" || Array.isArray(obj)) {
    const key = prefix || "(root)";
    const existing = result.get(key) ?? {
      types: new Set<string>(),
      presentCount: 0,
    };
    existing.types.add(getTypeName(obj));
    existing.presentCount++;
    result.set(key, existing);
    return;
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)) {
      // Recurse into nested objects
      flattenDoc(value, path, result);
    }

    // Also record the field itself
    const existing = result.get(path) ?? {
      types: new Set<string>(),
      presentCount: 0,
    };
    existing.types.add(getTypeName(value));
    existing.presentCount++;
    result.set(path, existing);
  }
}

function getTypeName(value: unknown): string {
  if (value === null) {return "null";}
  if (value === undefined) {return "undefined";}
  if (Array.isArray(value)) {return "array";}
  return typeof value;
}

function isIdLikeField(path: string, types: string[]): boolean {
  const leaf = path.split(".").pop() ?? path;
  return (
    (leaf.endsWith("Id") || leaf.endsWith("_id")) &&
    types.some((t) => t === "string")
  );
}

function guessTargetTable(fieldPath: string): string | null {
  const leaf = fieldPath.split(".").pop() ?? fieldPath;
  // Remove common suffixes to get table name
  const cleaned = leaf
    .replace(/Id$/, "")
    .replace(/_id$/, "")
    .replace(/^_/, "");

  if (cleaned.length < 2) {return null;}

  // Pluralize naively for common patterns
  if (!cleaned.endsWith("s")) {
    return cleaned + "s";
  }
  return cleaned;
}
