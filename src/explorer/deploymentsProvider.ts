import * as vscode from "vscode";
import type { ConnectionManager } from "../connection/connectionManager";

export class DeploymentItem extends vscode.TreeItem {
  constructor(
    label: string,
    description: string,
    public readonly isConnected: boolean
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = new vscode.ThemeIcon(
      isConnected ? "vm-running" : "vm-outline"
    );
    this.contextValue = isConnected ? "connectedDeployment" : "deployment";
  }
}

export class DeploymentsProvider
  implements vscode.TreeDataProvider<DeploymentItem>
{
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<DeploymentItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly connectionManager: ConnectionManager) {
    connectionManager.onDidChangeConnection(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: DeploymentItem): vscode.TreeItem {
    return element;
  }

  getChildren(): DeploymentItem[] {
    const deployment = this.connectionManager.activeDeployment;

    if (!deployment) {
      return [
        new DeploymentItem(
          "No deployment connected",
          "Click + to connect",
          false
        ),
      ];
    }

    return [
      new DeploymentItem(
        deployment.projectName ?? deployment.id,
        `${deployment.env} — ${deployment.url ?? "unknown"}`,
        true
      ),
    ];
  }
}
