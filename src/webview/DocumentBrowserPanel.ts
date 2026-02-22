import * as vscode from "vscode";
import { WebviewPanelManager } from "./WebviewPanelManager";
import type { FromWebviewMessage } from "../shared/messages";
import type { ConvexDataClient } from "../data/convexClient";

interface TableData {
  table: string;
  docs: unknown[];
  totalCount: number;
}

export class DocumentBrowserPanel extends WebviewPanelManager {
  private _currentTable: string | undefined;
  private _onRefreshRequest = new vscode.EventEmitter<string>();
  readonly onRefreshRequest = this._onRefreshRequest.event;

  constructor(
    extensionUri: vscode.Uri,
    private readonly _dataClient: ConvexDataClient
  ) {
    super(extensionUri, "exconvex.documentBrowser", "Document Browser");
  }

  protected getEntryPoint(): string {
    return "documentBrowser/index.js";
  }

  protected onMessage(message: FromWebviewMessage): void {
    switch (message.type) {
      case "ready":
        if (this._currentTable) {
          this._loadTable(this._currentTable);
        }
        break;
      case "refresh":
        if (this._currentTable) {
          this._loadTable(this._currentTable);
        }
        break;
      case "openFile":
        // Reused as "load table" from the webview refresh button
        if (message.path) {
          this._loadTable(message.path);
        }
        break;
      case "export":
        // Copy current doc to clipboard handled by webview
        break;
    }
  }

  protected onDispose(): void {
    this._currentTable = undefined;
  }

  async openTable(table: string, totalCount?: number): Promise<void> {
    this._currentTable = table;

    if (!this.panel) {
      this.show(vscode.ViewColumn.One);
    } else {
      this.panel.reveal(vscode.ViewColumn.One);
    }

    this.panel!.title = `${table} — Document Browser`;
    await this._loadTable(table, totalCount);
  }

  private async _loadTable(
    table: string,
    knownCount?: number
  ): Promise<void> {
    this._currentTable = table;
    this.postMessage({
      type: "loading",
      payload: { message: `Loading ${table}...` },
    });

    try {
      const limit = vscode.workspace
        .getConfiguration("exconvex")
        .get<number>("sampleLimit", 100);

      const docs = await this._dataClient.listDocs(table, limit);

      const totalCount = knownCount ?? docs.length;

      const data: TableData = {
        table,
        docs: docs as Record<string, unknown>[],
        totalCount,
      };

      this.panel?.webview.postMessage({
        type: "tableData",
        payload: data,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.postMessage({
        type: "error",
        payload: {
          message: `Failed to load "${table}": ${message}. Make sure "npx convex dev" is running and the _exconvex.ts helper is deployed.`,
        },
      });
    }
  }

  dispose(): void {
    this._onRefreshRequest.dispose();
    super.dispose();
  }
}
