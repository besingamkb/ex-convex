import * as vscode from "vscode";
import type { DeploymentTarget } from "../shared/types";
import { detectDeployments, pickDeployment } from "./deploymentResolver";

/**
 * Manages the active Convex deployment connection.
 * Emits events on connection change so tree views and panels can refresh.
 */
export class ConnectionManager implements vscode.Disposable {
  private _activeDeployment: DeploymentTarget | undefined;
  private readonly _onDidChangeConnection =
    new vscode.EventEmitter<DeploymentTarget | undefined>();
  readonly onDidChangeConnection = this._onDidChangeConnection.event;

  private readonly _statusBarItem: vscode.StatusBarItem;

  constructor(private readonly _secrets: vscode.SecretStorage) {
    this._statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this._statusBarItem.command = "exconvex.connect";
    this._updateStatusBar();
    this._statusBarItem.show();
  }

  get activeDeployment(): DeploymentTarget | undefined {
    return this._activeDeployment;
  }

  get isConnected(): boolean {
    return this._activeDeployment !== undefined;
  }

  /**
   * Detect deployments and prompt the user to connect.
   */
  async connect(): Promise<DeploymentTarget | undefined> {
    const targets = await detectDeployments();
    const selected = await pickDeployment(targets);

    if (selected) {
      this._activeDeployment = selected;
      this._onDidChangeConnection.fire(selected);
      this._updateStatusBar();

      // Store deployment URL in secrets for reconnect
      if (selected.url) {
        await this._secrets.store("exconvex.lastDeploymentUrl", selected.url);
      }

      vscode.window.showInformationMessage(
        `Connected to ${selected.env} deployment: ${selected.projectName ?? selected.url}`
      );
    }

    return selected;
  }

  /**
   * Disconnect the active deployment.
   */
  disconnect(): void {
    this._activeDeployment = undefined;
    this._onDidChangeConnection.fire(undefined);
    this._updateStatusBar();
    vscode.window.showInformationMessage("Disconnected from Convex deployment");
  }

  /**
   * Try reconnecting to the last known deployment URL.
   */
  async tryReconnect(): Promise<void> {
    const lastUrl = await this._secrets.get("exconvex.lastDeploymentUrl");
    if (!lastUrl) {
      return;
    }

    const targets = await detectDeployments();
    const match = targets.find((t) => t.url === lastUrl);
    if (match) {
      this._activeDeployment = { ...match, connectedAt: Date.now() };
      this._onDidChangeConnection.fire(this._activeDeployment);
      this._updateStatusBar();
    }
  }

  private _updateStatusBar(): void {
    if (this._activeDeployment) {
      const env = this._activeDeployment.env;
      const name =
        this._activeDeployment.projectName ?? this._activeDeployment.id;
      this._statusBarItem.text = `$(database) Convex: ${name} [${env}]`;
      this._statusBarItem.tooltip = `Connected to ${env} — ${this._activeDeployment.url ?? "unknown"}`;
      this._statusBarItem.backgroundColor = undefined;
    } else {
      this._statusBarItem.text = "$(debug-disconnect) Convex: Disconnected";
      this._statusBarItem.tooltip = "Click to connect to a Convex deployment";
      this._statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
    }
  }

  dispose(): void {
    this._statusBarItem.dispose();
    this._onDidChangeConnection.dispose();
  }
}
