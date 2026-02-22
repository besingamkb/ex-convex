import * as vscode from "vscode";
import type { ToWebviewMessage, FromWebviewMessage } from "../shared/messages";

/**
 * Base class for managing webview panels with typed messaging,
 * strict CSP, and resource URI handling.
 */
export abstract class WebviewPanelManager implements vscode.Disposable {
  protected panel: vscode.WebviewPanel | undefined;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(
    protected readonly extensionUri: vscode.Uri,
    protected readonly viewType: string,
    protected readonly title: string
  ) {}

  show(column: vscode.ViewColumn = vscode.ViewColumn.One): void {
    if (this.panel) {
      this.panel.reveal(column);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      this.viewType,
      this.title,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "dist", "webview"),
        ],
      }
    );

    this.panel.webview.html = this._getHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (msg: FromWebviewMessage) => this.onMessage(msg),
      undefined,
      this._disposables
    );

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
        this.onDispose();
      },
      undefined,
      this._disposables
    );
  }

  postMessage(message: ToWebviewMessage): void {
    this.panel?.webview.postMessage(message);
  }

  protected abstract getEntryPoint(): string;
  protected abstract onMessage(message: FromWebviewMessage): void;
  protected abstract onDispose(): void;

  private _getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "dist",
        "webview",
        this.getEntryPoint()
      )
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "dist",
        "webview",
        this.getEntryPoint().replace(/\.js$/, ".css")
      )
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
      style-src ${webview.cspSource} 'unsafe-inline';
      script-src 'nonce-${nonce}';
      font-src ${webview.cspSource};
      img-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>${this.title}</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this.panel?.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
}

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
