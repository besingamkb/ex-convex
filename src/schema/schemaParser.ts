import * as vscode from "vscode";
import type {
  TableSchema,
  FieldStat,
  RelationEdge,
  IndexDefinition,
} from "../shared/types";

/**
 * Parse convex/schema.ts to extract table definitions, field types,
 * and index definitions using regex-based heuristics.
 *
 * Supports:
 *  - Root-level convex/schema.ts
 *  - Monorepo nested paths (e.g., packages/convex/convex/schema.ts)
 *  - Split schema files (imports from ./schemas/ directory)
 *  - Custom validator references (resolves to the validator name)
 */
export async function parseConvexSchema(): Promise<{
  tables: TableSchema[];
  indexes: IndexDefinition[];
  relations: RelationEdge[];
}> {
  const schemaFile = await findSchemaFile();
  if (!schemaFile) {
    console.log("[ExConvex] No convex/schema.ts found in workspace");
    return { tables: [], indexes: [], relations: [] };
  }

  console.log(`[ExConvex] Found schema at: ${schemaFile.fsPath}`);

  const schemaContent = await readFileContent(schemaFile);
  if (!schemaContent) {
    return { tables: [], indexes: [], relations: [] };
  }

  // Collect all source content: the main schema file + any imported files
  const allSources = await collectAllSources(schemaFile, schemaContent);
  console.log(
    `[ExConvex] Parsing ${allSources.length} source file(s) for table definitions`
  );

  const tables: TableSchema[] = [];
  const indexes: IndexDefinition[] = [];
  const relations: RelationEdge[] = [];

  for (const source of allSources) {
    const result = parseSourceFile(source);
    tables.push(...result.tables);
    indexes.push(...result.indexes);
    relations.push(...result.relations);
  }

  console.log(
    `[ExConvex] Parsed ${tables.length} tables, ${indexes.length} indexes, ${relations.length} relations`
  );

  return { tables, indexes, relations };
}

/**
 * Collect the schema file content plus any locally imported files.
 * Follows relative imports like `from "./schemas"` or `from "./schemas/users"`.
 */
async function collectAllSources(
  schemaUri: vscode.Uri,
  schemaContent: string
): Promise<string[]> {
  const sources: string[] = [schemaContent];
  const schemaDir = vscode.Uri.joinPath(schemaUri, "..");

  // Find relative imports: import { ... } from "./something"
  const importPattern =
    /from\s+["']\.\/([^"']+)["']/g;
  let match: RegExpExecArray | null;
  const importPaths = new Set<string>();

  while ((match = importPattern.exec(schemaContent)) !== null) {
    importPaths.add(match[1]);
  }

  for (const importPath of importPaths) {
    // Try the import as a directory (index.ts) or as a file
    const candidates = [
      vscode.Uri.joinPath(schemaDir, importPath, "index.ts"),
      vscode.Uri.joinPath(schemaDir, importPath, "index.js"),
      vscode.Uri.joinPath(schemaDir, `${importPath}.ts`),
      vscode.Uri.joinPath(schemaDir, `${importPath}.js`),
    ];

    for (const candidate of candidates) {
      const content = await readFileContent(candidate);
      if (content) {
        // If this is an index file that re-exports, follow those too
        const reExports = await followReExports(candidate, content);
        sources.push(...reExports);
        break;
      }
    }
  }

  return sources;
}

/**
 * Follow re-export patterns in barrel files.
 * e.g., export { users } from "./users"
 */
async function followReExports(
  indexUri: vscode.Uri,
  indexContent: string
): Promise<string[]> {
  const sources: string[] = [];
  const dir = vscode.Uri.joinPath(indexUri, "..");

  const reExportPattern =
    /(?:export\s+\{[^}]*\}\s+from|export\s+\*\s+from)\s+["']\.\/([^"']+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = reExportPattern.exec(indexContent)) !== null) {
    const moduleName = match[1];
    const candidates = [
      vscode.Uri.joinPath(dir, `${moduleName}.ts`),
      vscode.Uri.joinPath(dir, `${moduleName}.js`),
      vscode.Uri.joinPath(dir, moduleName, "index.ts"),
    ];

    for (const candidate of candidates) {
      const content = await readFileContent(candidate);
      if (content) {
        sources.push(content);
        break;
      }
    }
  }

  // If no re-exports found, the index file itself may contain definitions
  if (sources.length === 0) {
    sources.push(indexContent);
  }

  return sources;
}

/**
 * Parse a single source file for defineTable definitions, indexes, and relations.
 */
function parseSourceFile(content: string): {
  tables: TableSchema[];
  indexes: IndexDefinition[];
  relations: RelationEdge[];
} {
  const tables: TableSchema[] = [];
  const indexes: IndexDefinition[] = [];
  const relations: RelationEdge[] = [];

  // Match both patterns:
  //   tableName: defineTable({ ... })           (inline in schema.ts)
  //   export const tableName = defineTable({ ... })  (split files)
  const tablePattern =
    /(?:(\w+)\s*:\s*defineTable|export\s+const\s+(\w+)\s*=\s*defineTable)\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = tablePattern.exec(content)) !== null) {
    const tableName = tableMatch[1] ?? tableMatch[2];
    const fieldsBlock = tableMatch[3];

    const fields = parseFields(fieldsBlock);
    const tableRelations = extractRelations(tableName, fieldsBlock);

    tables.push({
      table: tableName,
      fields,
      sampledDocs: 0,
      inferredAt: Date.now(),
    });

    relations.push(...tableRelations);

    // Extract indexes chained after the defineTable call
    const tableIndexes = extractIndexes(
      tableName,
      content,
      tableMatch.index
    );
    indexes.push(...tableIndexes);
  }

  return { tables, indexes, relations };
}

function parseFields(fieldsBlock: string): FieldStat[] {
  const fields: FieldStat[] = [];

  // Match field: v.type(...) or field: someValidator patterns
  const fieldPattern =
    /(\w+)\s*:\s*(?:v\.(\w+)\s*\(([^)]*(?:\([^)]*\))*[^)]*)\)|(\w+Validator|\w+Status\w*|\w+Type\w*|\w+Role\w*))/g;
  let fieldMatch: RegExpExecArray | null;

  while ((fieldMatch = fieldPattern.exec(fieldsBlock)) !== null) {
    const fieldName = fieldMatch[1];
    const validatorType = fieldMatch[2];
    const validatorArg = fieldMatch[3]?.trim() ?? "";
    const customValidator = fieldMatch[4];

    if (validatorType) {
      const types = resolveValidatorType(validatorType, validatorArg);
      const isOptional = validatorType === "optional";

      fields.push({
        path: fieldName,
        types,
        optionalRate: isOptional ? 1 : 0,
        sampleCount: 0,
        confidence: 1.0,
      });
    } else if (customValidator) {
      // Custom validator reference (e.g., userRoleValidator)
      fields.push({
        path: fieldName,
        types: [customValidator.replace(/Validator$/, "")],
        optionalRate: 0,
        sampleCount: 0,
        confidence: 0.8,
      });
    }
  }

  return fields;
}

function resolveValidatorType(
  validatorType: string,
  validatorArg: string
): string[] {
  switch (validatorType) {
    case "string":
      return ["string"];
    case "number":
    case "float64":
    case "int64":
      return ["number"];
    case "boolean":
      return ["boolean"];
    case "id":
      return [`Id<${validatorArg.replace(/["']/g, "")}>`];
    case "array":
      return ["array"];
    case "object":
      return ["object"];
    case "union":
      return ["union"];
    case "literal":
      return [`"${validatorArg.replace(/["']/g, "")}"`];
    case "optional": {
      // Try to extract the inner type
      const innerMatch = validatorArg.match(/v\.(\w+)\s*\(([^)]*)\)/);
      if (innerMatch) {
        return resolveValidatorType(innerMatch[1], innerMatch[2] ?? "");
      }
      return ["unknown?"];
    }
    case "null_":
      return ["null"];
    case "bytes":
      return ["bytes"];
    case "any":
      return ["any"];
    default:
      return [validatorType];
  }
}

function extractRelations(
  tableName: string,
  fieldsBlock: string
): RelationEdge[] {
  const relations: RelationEdge[] = [];
  // Match v.id("tableName") and v.optional(v.id("tableName")) patterns
  const idRefPattern =
    /(\w+)\s*:\s*v\.(?:optional\s*\(\s*)?id\s*\(\s*["'](\w+)["']\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = idRefPattern.exec(fieldsBlock)) !== null) {
    relations.push({
      fromTable: tableName,
      fromFieldPath: match[1],
      toTable: match[2],
      confidence: 1.0,
      source: "inferred",
    });
  }

  return relations;
}

function extractIndexes(
  tableName: string,
  fullContent: string,
  tableStart: number
): IndexDefinition[] {
  const indexes: IndexDefinition[] = [];

  // Look at content after the defineTable match, up to the next export/const/defineTable
  const afterTable = fullContent.substring(tableStart);
  // Limit scope: stop at next defineTable, export const, or end of chain
  const scopeMatch = afterTable.match(
    /defineTable\s*\(\s*\{[\s\S]*?\}\s*\)([\s\S]*?)(?=(?:export\s+const|(?:^|\n)\w+\s*:\s*defineTable)|$)/
  );
  const chainBlock = scopeMatch ? scopeMatch[1] : afterTable;

  // Match .index("name", ["field1", "field2"])
  const indexPattern =
    /\.index\s*\(\s*["']([^"']+)["']\s*,\s*\[([^\]]*)\]\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = indexPattern.exec(chainBlock)) !== null) {
    const name = match[1];
    const fieldsStr = match[2];
    const fields = fieldsStr
      .split(",")
      .map((f) => f.trim().replace(/["']/g, ""))
      .filter(Boolean);

    indexes.push({ table: tableName, name, fields, type: "by_field" });
  }

  // Match .searchIndex("name", { ... })
  const searchPattern =
    /\.searchIndex\s*\(\s*["']([^"']+)["']\s*,\s*\{([^}]*)\}\s*\)/g;
  while ((match = searchPattern.exec(chainBlock)) !== null) {
    const name = match[1];
    const body = match[2];
    const searchFieldMatch = body.match(/searchField\s*:\s*["'](\w+)["']/);
    const fields = searchFieldMatch ? [searchFieldMatch[1]] : [];

    indexes.push({ table: tableName, name, fields, type: "search" });
  }

  // Match .vectorIndex("name", { ... })
  const vectorPattern =
    /\.vectorIndex\s*\(\s*["']([^"']+)["']\s*,\s*\{([^}]*)\}\s*\)/g;
  while ((match = vectorPattern.exec(chainBlock)) !== null) {
    const name = match[1];
    const body = match[2];
    const vectorFieldMatch = body.match(/vectorField\s*:\s*["'](\w+)["']/);
    const fields = vectorFieldMatch ? [vectorFieldMatch[1]] : [];

    indexes.push({ table: tableName, name, fields, type: "vector" });
  }

  return indexes;
}

/**
 * Find convex/schema.ts in the workspace, supporting monorepo structures.
 * Uses glob pattern to find it at any nesting depth.
 */
async function findSchemaFile(): Promise<vscode.Uri | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {
    return null;
  }

  // Use glob to find schema.ts at any depth
  const pattern = new vscode.RelativePattern(
    workspaceFolders[0],
    "**/convex/schema.{ts,js}"
  );

  const files = await vscode.workspace.findFiles(
    pattern,
    "**/node_modules/**",
    5
  );

  if (files.length === 0) {
    return null;
  }

  // Prefer the shortest path (closest to workspace root)
  files.sort((a, b) => a.fsPath.length - b.fsPath.length);
  return files[0];
}

async function readFileContent(uri: vscode.Uri): Promise<string | null> {
  try {
    const content = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(content).toString("utf-8");
  } catch {
    return null;
  }
}
