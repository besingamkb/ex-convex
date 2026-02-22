import * as vscode from "vscode";
import { WebviewPanelManager } from "./WebviewPanelManager";
import type { FromWebviewMessage } from "../shared/messages";
import type { IndexCoverageIssue } from "../shared/types";

export class IndexInspectorPanel extends WebviewPanelManager {
  private _currentFindings: IndexCoverageIssue[] = [];
  private _onRefreshRequest = new vscode.EventEmitter<void>();
  readonly onRefreshRequest = this._onRefreshRequest.event;

  constructor(extensionUri: vscode.Uri) {
    super(extensionUri, "exconvex.indexInspector", "Index Inspector");
  }

  protected getEntryPoint(): string {
    return "indexInspector/index.js";
  }

  protected onMessage(message: FromWebviewMessage): void {
    switch (message.type) {
      case "ready":
        if (this._currentFindings.length > 0) {
          this.postMessage({
            type: "indexFindings",
            payload: this._currentFindings,
          });
        }
        break;
      case "refresh":
        this._onRefreshRequest.fire();
        break;
      case "openFile":
        if (message.path) {
          // Parse "file:line" format
          const parts = message.path.split(":");
          const filePath = parts[0];
          const line = parts[1] ? parseInt(parts[1], 10) : undefined;
          const uri = vscode.Uri.file(filePath);
          vscode.window.showTextDocument(uri, {
            selection: line
              ? new vscode.Range(line - 1, 0, line - 1, 0)
              : undefined,
          });
        }
        break;
    }
  }

  protected onDispose(): void {
    this._currentFindings = [];
  }

  updateFindings(findings: IndexCoverageIssue[]): void {
    this._currentFindings = findings;
    this.postMessage({ type: "indexFindings", payload: findings });
  }

  dispose(): void {
    this._onRefreshRequest.dispose();
    super.dispose();
  }
}
