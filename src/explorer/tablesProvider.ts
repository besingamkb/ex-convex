import * as vscode from "vscode";
import type { ConnectionManager } from "../connection/connectionManager";
import type { TableSchema, FieldStat, IndexDefinition } from "../shared/types";

type TableTreeItem = TableItem | FieldItem | IndexGroupItem | IndexItem;

export class TableItem extends vscode.TreeItem {
  constructor(
    public readonly schema: TableSchema,
    public readonly indexes: IndexDefinition[],
    docCount?: number
  ) {
    super(schema.table, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("table");
    const countLabel = docCount !== undefined ? `${docCount} docs` : `${schema.fields.length} fields`;
    this.description = countLabel;
    this.contextValue = "table";
    // Click to browse table data
    this.command = {
      command: "exconvex.browseTable",
      title: "Browse Table",
      arguments: [schema.table, docCount],
    };
  }
}

export class FieldItem extends vscode.TreeItem {
  constructor(field: FieldStat) {
    super(field.path, vscode.TreeItemCollapsibleState.None);
    this.description = `${field.types.join(" | ")}${field.optionalRate > 0 ? "?" : ""}`;
    this.iconPath = new vscode.ThemeIcon("symbol-field");
    this.contextValue = "field";
    this.tooltip = `Types: ${field.types.join(", ")}\nOptional rate: ${(field.optionalRate * 100).toFixed(0)}%\nSampled: ${field.sampleCount}\nConfidence: ${(field.confidence * 100).toFixed(0)}%`;
  }
}

export class IndexGroupItem extends vscode.TreeItem {
  constructor(
    public readonly tableName: string,
    public readonly indexes: IndexDefinition[]
  ) {
    super("Indexes", vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("list-tree");
    this.description = `${indexes.length}`;
    this.contextValue = "indexGroup";
  }
}

export class IndexItem extends vscode.TreeItem {
  constructor(index: IndexDefinition) {
    super(index.name, vscode.TreeItemCollapsibleState.None);
    this.description = `${index.type} — [${index.fields.join(", ")}]`;
    this.iconPath = new vscode.ThemeIcon(
      index.type === "search"
        ? "search"
        : index.type === "vector"
          ? "compass"
          : "key"
    );
    this.contextValue = "index";
  }
}

export class TablesProvider implements vscode.TreeDataProvider<TableTreeItem> {
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<TableTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _tables: TableSchema[] = [];
  private _indexes: Map<string, IndexDefinition[]> = new Map();
  private _docCounts: Map<string, number> = new Map();

  constructor(private readonly connectionManager: ConnectionManager) {
    connectionManager.onDidChangeConnection(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  setData(tables: TableSchema[], indexes: IndexDefinition[]): void {
    this._tables = tables;
    this._indexes = new Map();
    for (const idx of indexes) {
      const list = this._indexes.get(idx.table) ?? [];
      list.push(idx);
      this._indexes.set(idx.table, list);
    }
    this.refresh();
  }

  setDocCounts(counts: Record<string, number>): void {
    this._docCounts = new Map(Object.entries(counts));
    this.refresh();
  }

  getTreeItem(element: TableTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TableTreeItem): TableTreeItem[] {
    if (!this.connectionManager.isConnected) {
      return [];
    }

    if (!element) {
      return this._tables.map(
        (t) => new TableItem(
          t,
          this._indexes.get(t.table) ?? [],
          this._docCounts.get(t.table)
        )
      );
    }

    if (element instanceof TableItem) {
      const children: TableTreeItem[] = element.schema.fields.map(
        (f) => new FieldItem(f)
      );
      if (element.indexes.length > 0) {
        children.push(
          new IndexGroupItem(element.schema.table, element.indexes)
        );
      }
      return children;
    }

    if (element instanceof IndexGroupItem) {
      return element.indexes.map((idx) => new IndexItem(idx));
    }

    return [];
  }
}
