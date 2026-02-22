import * as vscode from "vscode";
import { WebviewPanelManager } from "./WebviewPanelManager";
import type { FromWebviewMessage } from "../shared/messages";
import type { QueryWatchUpdate } from "../shared/types";
import type { QueryWatcher } from "../watch/queryWatcher";

export class QueryWatchPanel extends WebviewPanelManager {
  private _disposableListeners: vscode.Disposable[] = [];

  constructor(
    extensionUri: vscode.Uri,
    private readonly _watcher: QueryWatcher
  ) {
    super(extensionUri, "exconvex.queryWatch", "Query Watch");
  }

  protected getEntryPoint(): string {
    return "queryWatch/index.js";
  }

  show(column?: vscode.ViewColumn): void {
    super.show(column);
    this._wireWatcher();
  }

  protected onMessage(message: FromWebviewMessage): void {
    switch (message.type) {
      case "ready":
        // Nothing to send on ready — updates stream in
        break;
      case "refresh":
        if (this._watcher.isWatching) {
          this._watcher.stopWatching();
        }
        break;
    }
  }

  protected onDispose(): void {
    this._disposableListeners.forEach((d) => d.dispose());
    this._disposableListeners = [];
  }

  sendUpdate(update: QueryWatchUpdate): void {
    this.postMessage({ type: "watchUpdate", payload: update });
  }

  private _wireWatcher(): void {
    this._disposableListeners.push(
      this._watcher.onUpdate((update) => {
        this.sendUpdate(update);
      }),
      this._watcher.onError((message) => {
        this.postMessage({ type: "error", payload: { message } });
      })
    );
  }

  dispose(): void {
    this._disposableListeners.forEach((d) => d.dispose());
    super.dispose();
  }
}
