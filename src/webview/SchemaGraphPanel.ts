import * as vscode from "vscode";
import { WebviewPanelManager } from "./WebviewPanelManager";
import type { FromWebviewMessage } from "../shared/messages";
import type { SchemaGraphDto } from "../shared/types";

export class SchemaGraphPanel extends WebviewPanelManager {
  private _currentData: SchemaGraphDto | undefined;
  private _onRefreshRequest = new vscode.EventEmitter<void>();
  readonly onRefreshRequest = this._onRefreshRequest.event;

  constructor(extensionUri: vscode.Uri) {
    super(extensionUri, "exconvex.schemaGraph", "Schema Graph");
  }

  protected getEntryPoint(): string {
    return "schemaGraph/index.js";
  }

  protected onMessage(message: FromWebviewMessage): void {
    switch (message.type) {
      case "ready":
        if (this._currentData) {
          this.postMessage({
            type: "schemaGraphData",
            payload: this._currentData,
          });
        }
        break;
      case "refresh":
        this._onRefreshRequest.fire();
        break;
      case "openFile":
        if (message.path) {
          const uri = vscode.Uri.file(message.path);
          vscode.window.showTextDocument(uri, {
            selection: message.line
              ? new vscode.Range(message.line - 1, 0, message.line - 1, 0)
              : undefined,
          });
        }
        break;
      case "export":
        this._handleExport(message.format);
        break;
    }
  }

  protected onDispose(): void {
    this._currentData = undefined;
  }

  updateGraph(data: SchemaGraphDto): void {
    this._currentData = data;
    this.postMessage({ type: "schemaGraphData", payload: data });
  }

  private async _handleExport(format: "json" | "svg" | "png"): Promise<void> {
    if (!this._currentData) {return;}

    if (format === "json") {
      const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(this._currentData, null, 2),
        language: "json",
      });
      await vscode.window.showTextDocument(doc);
    } else {
      vscode.window.showInformationMessage(
        `${format.toUpperCase()} export coming in a future update.`
      );
    }
  }

  dispose(): void {
    this._onRefreshRequest.dispose();
    super.dispose();
  }
}
