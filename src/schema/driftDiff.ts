import type {
  SchemaSnapshot,
  SchemaDriftDto,
  TableDiff,
  FieldDiff,
} from "../shared/types";

/**
 * Compare two schema snapshots and produce a structured drift diff.
 * Per snapshot-drift-diff skill: deterministic, scoped per deployment, filterable.
 */
export function computeDrift(
  from: SchemaSnapshot,
  to: SchemaSnapshot
): SchemaDriftDto {
  const tableDiffs: TableDiff[] = [];

  const fromTableMap = new Map(from.tables.map((t) => [t.table, t]));
  const toTableMap = new Map(to.tables.map((t) => [t.table, t]));

  // Added tables
  for (const [name, toTable] of toTableMap) {
    if (!fromTableMap.has(name)) {
      tableDiffs.push({
        table: name,
        change: "added",
        fieldDiffs: toTable.fields.map((f) => ({
          path: f.path,
          change: "added" as const,
          newTypes: f.types,
        })),
      });
    }
  }

  // Removed tables
  for (const [name, fromTable] of fromTableMap) {
    if (!toTableMap.has(name)) {
      tableDiffs.push({
        table: name,
        change: "removed",
        fieldDiffs: fromTable.fields.map((f) => ({
          path: f.path,
          change: "removed" as const,
          oldTypes: f.types,
        })),
      });
    }
  }

  // Modified tables
  for (const [name, fromTable] of fromTableMap) {
    const toTable = toTableMap.get(name);
    if (!toTable) {continue;}

    const fieldDiffs = diffFields(fromTable.fields, toTable.fields);
    if (fieldDiffs.length > 0) {
      tableDiffs.push({
        table: name,
        change: "modified",
        fieldDiffs,
      });
    }
  }

  // Sort: added first, then modified, then removed
  tableDiffs.sort((a, b) => {
    const order = { added: 0, modified: 1, removed: 2 };
    return order[a.change] - order[b.change];
  });

  const summary = buildSummary(tableDiffs);

  return {
    fromSnapshotId: from.id,
    toSnapshotId: to.id,
    tableDiffs,
    summary,
  };
}

function diffFields(
  fromFields: { path: string; types: string[] }[],
  toFields: { path: string; types: string[] }[]
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  const fromMap = new Map(fromFields.map((f) => [f.path, f]));
  const toMap = new Map(toFields.map((f) => [f.path, f]));

  for (const [path, toField] of toMap) {
    const fromField = fromMap.get(path);
    if (!fromField) {
      diffs.push({ path, change: "added", newTypes: toField.types });
    } else {
      const typesChanged =
        JSON.stringify([...toField.types].sort()) !==
        JSON.stringify([...fromField.types].sort());
      if (typesChanged) {
        diffs.push({
          path,
          change: "type_changed",
          oldTypes: fromField.types,
          newTypes: toField.types,
        });
      }
    }
  }

  for (const [path, fromField] of fromMap) {
    if (!toMap.has(path)) {
      diffs.push({ path, change: "removed", oldTypes: fromField.types });
    }
  }

  return diffs.sort((a, b) => a.path.localeCompare(b.path));
}

function buildSummary(tableDiffs: TableDiff[]): string {
  const added = tableDiffs.filter((t) => t.change === "added").length;
  const removed = tableDiffs.filter((t) => t.change === "removed").length;
  const modified = tableDiffs.filter((t) => t.change === "modified").length;

  const parts: string[] = [];
  if (added) {parts.push(`${added} table(s) added`);}
  if (removed) {parts.push(`${removed} table(s) removed`);}
  if (modified) {
    const totalFieldChanges = tableDiffs
      .filter((t) => t.change === "modified")
      .reduce((sum, t) => sum + t.fieldDiffs.length, 0);
    parts.push(
      `${modified} table(s) modified (${totalFieldChanges} field changes)`
    );
  }

  if (parts.length === 0) {return "No schema changes detected.";}
  return parts.join(", ") + ".";
}
