import * as vscode from "vscode";

/**
 * Centralized Convex project detection.
 *
 * All searches use plain glob patterns (not RelativePattern),
 * so they work across ALL workspace folders — multi-root workspaces,
 * monorepos, flat projects, whatever.
 */

/**
 * Find the root directory of a Convex project (the folder that
 * contains the `convex/` directory).
 *
 * Detection: looks for `convex/_generated/server.{ts,js,d.ts}`.
 * Returns the project root (three levels up from the server file).
 */
export async function findConvexProjectDir(): Promise<string | null> {
  const files = await vscode.workspace.findFiles(
    "**/convex/_generated/server.{js,ts,d.ts}",
    "**/node_modules/**",
    10
  );

  if (files.length === 0) { return null; }

  // Prefer the shortest path (closest to workspace root)
  files.sort((a, b) => a.fsPath.length - b.fsPath.length);
  const convexDir = vscode.Uri.joinPath(files[0], "..", "..", "..");
  return convexDir.fsPath;
}

/**
 * Find the `convex/` directory itself (the folder containing schema.ts,
 * _generated/, etc.).
 *
 * Returns a vscode.Uri for file operations.
 */
export async function findConvexDir(): Promise<vscode.Uri | null> {
  const files = await vscode.workspace.findFiles(
    "**/convex/_generated/server.{js,ts,d.ts}",
    "**/node_modules/**",
    10
  );

  if (files.length === 0) { return null; }

  files.sort((a, b) => a.fsPath.length - b.fsPath.length);
  return vscode.Uri.joinPath(files[0], "..", "..");
}

/**
 * Find convex/schema.{ts,js} in the workspace.
 * Supports any nesting depth.
 */
export async function findSchemaFile(): Promise<vscode.Uri | null> {
  const files = await vscode.workspace.findFiles(
    "**/convex/schema.{ts,js}",
    "**/node_modules/**",
    10
  );

  if (files.length === 0) { return null; }

  files.sort((a, b) => a.fsPath.length - b.fsPath.length);
  return files[0];
}

/**
 * Check whether the _exconvex.ts helper file exists in any convex directory.
 */
export async function helperFileExists(): Promise<boolean> {
  const files = await vscode.workspace.findFiles(
    "**/convex/_exconvex.ts",
    "**/node_modules/**",
    1
  );
  return files.length > 0;
}

/**
 * Find all .env.local files in the workspace that contain CONVEX_URL.
 * Returns an array of { uri, url, projectName } for each match.
 */
export async function findConvexEnvFiles(): Promise<
  { uri: vscode.Uri; url: string; projectName: string }[]
> {
  const envFiles = await vscode.workspace.findFiles(
    "**/.env.local",
    "**/node_modules/**",
    20
  );

  const results: { uri: vscode.Uri; url: string; projectName: string }[] = [];

  for (const envUri of envFiles) {
    try {
      const content = Buffer.from(
        await vscode.workspace.fs.readFile(envUri)
      ).toString("utf-8");

      const match = content.match(
        /CONVEX_URL\s*=\s*["']?(https?:\/\/[^\s"']+)["']?/
      );
      if (match) {
        const dirPath = envUri.fsPath.replace(/[/\\]\.env\.local$/, "");
        const projectName = dirPath.split(/[/\\]/).pop() ?? "unknown";
        results.push({ uri: envUri, url: match[1], projectName });
      }
    } catch {
      // skip unreadable files
    }
  }

  return results;
}

import { parseConvexSchema, ParsedSchema } from "./schemaParser";

/**
 * Reads and parses the user's `convex/schema.ts` file to extract
 * basic validation rules (like which fields are optional).
 */
export async function getParsedSchema(): Promise<ParsedSchema | null> {
  const schemaUri = await findSchemaFile();
  if (!schemaUri) {
    return null;
  }

  try {
    const contentBuffer = await vscode.workspace.fs.readFile(schemaUri);
    const content = Buffer.from(contentBuffer).toString("utf-8");

    return parseConvexSchema(content);
  } catch (err) {
    console.error("Failed to read convex schema:", err);
    return null;
  }
}

