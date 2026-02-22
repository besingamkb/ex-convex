import * as vscode from "vscode";
import type { SchemaSnapshot } from "../shared/types";

class SnapshotItem extends vscode.TreeItem {
  constructor(public readonly snapshot: SchemaSnapshot) {
    super(
      new Date(snapshot.createdAt).toLocaleString(),
      vscode.TreeItemCollapsibleState.None
    );
    this.description = `${snapshot.tables.length} tables`;
    this.iconPath = new vscode.ThemeIcon("history");
    this.contextValue = "snapshot";
    this.tooltip = `ID: ${snapshot.id}\nDeployment: ${snapshot.deploymentId}\nTables: ${snapshot.tables.length}\nRelations: ${snapshot.relations.length}`;
  }
}

export class DriftProvider implements vscode.TreeDataProvider<SnapshotItem> {
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<SnapshotItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _snapshots: SchemaSnapshot[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  setSnapshots(snapshots: SchemaSnapshot[]): void {
    this._snapshots = snapshots.sort((a, b) => b.createdAt - a.createdAt);
    this.refresh();
  }

  addSnapshot(snapshot: SchemaSnapshot): void {
    this._snapshots.unshift(snapshot);
    this.refresh();
  }

  getSnapshots(): SchemaSnapshot[] {
    return this._snapshots;
  }

  getTreeItem(element: SnapshotItem): vscode.TreeItem {
    return element;
  }

  getChildren(): SnapshotItem[] {
    if (this._snapshots.length === 0) {
      return [];
    }
    return this._snapshots.map((s) => new SnapshotItem(s));
  }
}
