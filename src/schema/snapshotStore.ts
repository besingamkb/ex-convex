import * as vscode from "vscode";
import type { SchemaSnapshot } from "../shared/types";
import { randomUUID } from "crypto";

/**
 * Persists and retrieves schema snapshots from globalStorageUri.
 */
export class SnapshotStore {
  private readonly _storageDir: vscode.Uri;

  constructor(globalStorageUri: vscode.Uri) {
    this._storageDir = vscode.Uri.joinPath(globalStorageUri, "snapshots");
  }

  async initialize(): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(this._storageDir);
    } catch {
      // Directory may already exist
    }
  }

  async save(snapshot: SchemaSnapshot): Promise<void> {
    const fileName = `${snapshot.id}.json`;
    const fileUri = vscode.Uri.joinPath(this._storageDir, fileName);
    const content = Buffer.from(JSON.stringify(snapshot, null, 2), "utf-8");
    await vscode.workspace.fs.writeFile(fileUri, content);
  }

  async list(deploymentId?: string): Promise<SchemaSnapshot[]> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(this._storageDir);
      const snapshots: SchemaSnapshot[] = [];

      for (const [name, type] of entries) {
        if (type !== vscode.FileType.File || !name.endsWith(".json")) {
          continue;
        }

        const uri = vscode.Uri.joinPath(this._storageDir, name);
        const content = await vscode.workspace.fs.readFile(uri);
        const snapshot = JSON.parse(
          Buffer.from(content).toString("utf-8")
        ) as SchemaSnapshot;

        if (!deploymentId || snapshot.deploymentId === deploymentId) {
          snapshots.push(snapshot);
        }
      }

      return snapshots.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }

  async get(snapshotId: string): Promise<SchemaSnapshot | null> {
    try {
      const uri = vscode.Uri.joinPath(this._storageDir, `${snapshotId}.json`);
      const content = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(
        Buffer.from(content).toString("utf-8")
      ) as SchemaSnapshot;
    } catch {
      return null;
    }
  }

  createSnapshot(
    deploymentId: string,
    tables: SchemaSnapshot["tables"],
    relations: SchemaSnapshot["relations"]
  ): SchemaSnapshot {
    return {
      id: randomUUID(),
      deploymentId,
      createdAt: Date.now(),
      tables,
      relations,
    };
  }
}
