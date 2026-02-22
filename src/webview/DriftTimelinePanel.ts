import * as vscode from "vscode";
import { WebviewPanelManager } from "./WebviewPanelManager";
import type { FromWebviewMessage } from "../shared/messages";
import type { SchemaDriftDto } from "../shared/types";

export class DriftTimelinePanel extends WebviewPanelManager {
  private _currentDrift: SchemaDriftDto | undefined;
  private _onRefreshRequest = new vscode.EventEmitter<void>();
  readonly onRefreshRequest = this._onRefreshRequest.event;

  constructor(extensionUri: vscode.Uri) {
    super(extensionUri, "exconvex.driftTimeline", "Drift Timeline");
  }

  protected getEntryPoint(): string {
    return "driftTimeline/index.js";
  }

  protected onMessage(message: FromWebviewMessage): void {
    switch (message.type) {
      case "ready":
        if (this._currentDrift) {
          this.postMessage({
            type: "driftDiff",
            payload: this._currentDrift,
          });
        }
        break;
      case "refresh":
        this._onRefreshRequest.fire();
        break;
      case "export":
        if (message.format === "json" && this._currentDrift) {
          this._exportJson();
        }
        break;
    }
  }

  protected onDispose(): void {
    this._currentDrift = undefined;
  }

  updateDrift(drift: SchemaDriftDto): void {
    this._currentDrift = drift;
    this.postMessage({ type: "driftDiff", payload: drift });
  }

  private async _exportJson(): Promise<void> {
    if (!this._currentDrift) {return;}
    const doc = await vscode.workspace.openTextDocument({
      content: JSON.stringify(this._currentDrift, null, 2),
      language: "json",
    });
    await vscode.window.showTextDocument(doc);
  }

  dispose(): void {
    this._onRefreshRequest.dispose();
    super.dispose();
  }
}
