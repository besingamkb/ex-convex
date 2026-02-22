import * as vscode from "vscode";
import type { ConnectionManager } from "../connection/connectionManager";
import type { IndexDefinition } from "../shared/types";

class IndexTreeItem extends vscode.TreeItem {
  constructor(
    public readonly index: IndexDefinition,
    collapsible: vscode.TreeItemCollapsibleState
  ) {
    super(index.name, collapsible);
  }
}

class TableGroupItem extends vscode.TreeItem {
  constructor(
    public readonly tableName: string,
    public readonly indexes: IndexDefinition[]
  ) {
    super(tableName, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("table");
    this.description = `${indexes.length} indexes`;
    this.contextValue = "indexTableGroup";
  }
}

class IndexLeafItem extends vscode.TreeItem {
  constructor(index: IndexDefinition) {
    super(index.name, vscode.TreeItemCollapsibleState.None);
    this.description = `[${index.fields.join(", ")}]`;
    this.iconPath = new vscode.ThemeIcon(
      index.type === "search"
        ? "search"
        : index.type === "vector"
          ? "compass"
          : "key"
    );
    this.tooltip = `Type: ${index.type}\nFields: ${index.fields.join(", ")}`;
    this.contextValue = "indexLeaf";
  }
}

type IndexViewItem = TableGroupItem | IndexLeafItem;

export class IndexesProvider
  implements vscode.TreeDataProvider<IndexViewItem>
{
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<IndexViewItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _indexesByTable: Map<string, IndexDefinition[]> = new Map();

  constructor(private readonly connectionManager: ConnectionManager) {
    connectionManager.onDidChangeConnection(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  setData(indexes: IndexDefinition[]): void {
    this._indexesByTable = new Map();
    for (const idx of indexes) {
      const list = this._indexesByTable.get(idx.table) ?? [];
      list.push(idx);
      this._indexesByTable.set(idx.table, list);
    }
    this.refresh();
  }

  getTreeItem(element: IndexViewItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: IndexViewItem): IndexViewItem[] {
    if (!this.connectionManager.isConnected) {
      return [];
    }

    if (!element) {
      return Array.from(this._indexesByTable.entries()).map(
        ([table, indexes]) => new TableGroupItem(table, indexes)
      );
    }

    if (element instanceof TableGroupItem) {
      return element.indexes.map((idx) => new IndexLeafItem(idx));
    }

    return [];
  }
}
