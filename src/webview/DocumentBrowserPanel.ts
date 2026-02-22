import * as vscode from "vscode";
import { WebviewPanelManager } from "./WebviewPanelManager";
import type { FromWebviewMessage } from "../shared/messages";
import type { ConvexDataClient } from "../data/convexClient";

interface TableData {
  table: string;
  docs: unknown[];
  totalCount: number;
  fieldOrder?: string[];
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

  private _fieldOrder: string[] | undefined;

  async openTable(table: string, totalCount?: number, fieldOrder?: string[]): Promise<void> {
    this._currentTable = table;
    this._fieldOrder = fieldOrder;

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
      payload: { message: `Checking Convex connection...` },
    });

    // Readiness check — detect and fix issues before querying
    const readinessError = await this._dataClient.checkReadiness();
    if (readinessError) {
      const shouldRetry = await this._dataClient.fix(readinessError);
      if (shouldRetry) {
        // Re-check after fix attempt
        const stillBroken = await this._dataClient.checkReadiness();
        if (stillBroken) {
          this.postMessage({
            type: "error",
            payload: {
              message: this._readinessErrorMessage(stillBroken),
            },
          });
          return;
        }
      } else {
        this.postMessage({
          type: "error",
          payload: {
            message: this._readinessErrorMessage(readinessError),
          },
        });
        return;
      }
    }

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
        fieldOrder: this._fieldOrder,
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
          message: `Failed to load "${table}": ${message}`,
        },
      });
    }
  }

  private _readinessErrorMessage(error: import("../data/convexClient").DataClientError): string {
    switch (error.kind) {
      case "no_deployment":
        return "No Convex deployment connected. Use the Connect command first.";
      case "no_convex_project":
        return "No Convex project found in this workspace. Open a folder that contains a convex/ directory.";
      case "helper_not_deployed":
        return "The ExConvex data browser helper is not deployed. Run 'npx convex dev' to deploy it.";
      case "convex_not_running":
        return "Cannot reach the Convex deployment. Make sure 'npx convex dev' is running.";
      case "query_failed":
        return `Query failed: ${error.message}`;
    }
  }

  dispose(): void {
    this._onRefreshRequest.dispose();
    super.dispose();
  }
}
