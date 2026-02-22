import * as vscode from "vscode";
import { execFile } from "child_process";
import type { QueryWatchUpdate } from "../shared/types";
import type { ConnectionManager } from "../connection/connectionManager";

/**
 * Watches a Convex query function for live result updates.
 * Uses convex CLI to run the query periodically and stream updates.
 */
export class QueryWatcher implements vscode.Disposable {
  private _timer: ReturnType<typeof setInterval> | undefined;
  private _isWatching = false;
  private readonly _onUpdate = new vscode.EventEmitter<QueryWatchUpdate>();
  readonly onUpdate = this._onUpdate.event;

  private readonly _onError = new vscode.EventEmitter<string>();
  readonly onError = this._onError.event;

  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly _pollIntervalMs: number = 2000
  ) {}

  get isWatching(): boolean {
    return this._isWatching;
  }

  async startWatching(queryFunctionName: string): Promise<void> {
    if (this._isWatching) {
      this.stopWatching();
    }

    const deployment = this.connectionManager.activeDeployment;
    if (!deployment) {
      this._onError.fire("No deployment connected");
      return;
    }

    this._isWatching = true;

    const limit = vscode.workspace
      .getConfiguration("exconvex")
      .get<number>("queryWatchLimit", 50);

    // Initial run
    await this._runQuery(queryFunctionName, deployment.url, limit);

    // Set up polling
    this._timer = setInterval(async () => {
      if (!this._isWatching) {return;}
      await this._runQuery(queryFunctionName, deployment.url, limit);
    }, this._pollIntervalMs);
  }

  stopWatching(): void {
    this._isWatching = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  private async _runQuery(
    functionName: string,
    deploymentUrl: string | undefined,
    limit: number
  ): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {return;}

    const startTime = Date.now();

    try {
      const npxPath = process.platform === "win32" ? "npx.cmd" : "npx";
      const args = ["convex", "run", functionName];
      if (deploymentUrl) {
        args.push("--url", deploymentUrl);
      }

      const result = await new Promise<string>((resolve, reject) => {
        execFile(
          npxPath,
          args,
          {
            cwd: workspaceFolders[0].uri.fsPath,
            timeout: 10000,
            env: { ...process.env, FORCE_COLOR: "0" },
          },
          (error, stdout, stderr) => {
            if (error) {
              reject(new Error(stderr || error.message));
            } else {
              resolve(stdout);
            }
          }
        );
      });

      const durationMs = Date.now() - startTime;

      // Try to parse the result as JSON
      let results: unknown[] = [];
      try {
        const parsed = JSON.parse(result.trim());
        results = Array.isArray(parsed)
          ? parsed.slice(0, limit)
          : [parsed];
      } catch {
        results = [{ raw: result.trim() }];
      }

      // Extract table name from function name (e.g., "messages:list" -> "messages")
      const table = functionName.split(":")[0].split("/").pop() ?? functionName;

      this._onUpdate.fire({
        queryName: functionName,
        table,
        timestamp: Date.now(),
        resultCount: results.length,
        results,
        durationMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._onError.fire(`Query "${functionName}" failed: ${message}`);
    }
  }

  dispose(): void {
    this.stopWatching();
    this._onUpdate.dispose();
    this._onError.dispose();
  }
}
