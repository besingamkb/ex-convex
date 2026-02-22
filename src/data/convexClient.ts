import * as vscode from "vscode";
import { execFile } from "child_process";
import type { ConnectionManager } from "../connection/connectionManager";
import { ensureHelperFile } from "./helperGenerator";
import { findConvexProjectDir, helperFileExists } from "../convexProject";

export type DataClientError =
  | { kind: "no_deployment" }
  | { kind: "no_convex_project" }
  | { kind: "helper_not_deployed"; helperExists: boolean }
  | { kind: "convex_not_running" }
  | { kind: "query_failed"; message: string };

export class ConvexDataClient {
  constructor(
    private readonly connectionManager: ConnectionManager
  ) { }

  /**
   * Check readiness: deployment connected, convex project found, helper deployed.
   * Returns null if ready, or a DataClientError describing what's wrong.
   */
  async checkReadiness(): Promise<DataClientError | null> {
    if (!this.connectionManager.activeDeployment) {
      return { kind: "no_deployment" };
    }

    const convexDir = await findConvexProjectDir();
    if (!convexDir) {
      return { kind: "no_convex_project" };
    }

    await ensureHelperFile();

    // Quick test: try running the helper
    try {
      await this._run(".exconvex/_exconvex:_countDocs", { table: "_does_not_exist" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes("Could not find function")) {
        const exists = await helperFileExists();
        return { kind: "helper_not_deployed", helperExists: exists };
      }

      if (
        msg.includes("ECONNREFUSED") ||
        msg.includes("connect ETIMEDOUT") ||
        msg.includes("fetch failed") ||
        msg.includes("Could not find deployment")
      ) {
        return { kind: "convex_not_running" };
      }

      // Table not found is expected — means the helper IS deployed and working
      if (msg.includes("Table") && msg.includes("not found")) {
        return null;
      }

      // Any other error we can't classify — the helper probably works
      // but the specific table doesn't exist, which is fine
      return null;
    }

    return null;
  }

  /**
   * Attempt to fix the current readiness issue.
   * Returns true if the user should retry.
   */
  async fix(error: DataClientError): Promise<boolean> {
    switch (error.kind) {
      case "no_deployment": {
        const action = await vscode.window.showWarningMessage(
          "No Convex deployment connected.",
          "Connect Now"
        );
        if (action === "Connect Now") {
          await vscode.commands.executeCommand("exconvex.connect");
          return this.connectionManager.isConnected;
        }
        return false;
      }

      case "no_convex_project":
        vscode.window.showWarningMessage(
          "No Convex project found in this workspace. Open a folder that contains a convex/ directory."
        );
        return false;

      case "helper_not_deployed": {
        if (!error.helperExists) {
          // Create the helper file
          const result = await ensureHelperFile();
          if (!result) { return false; }
        }

        const action = await vscode.window.showWarningMessage(
          "The ExConvex data browser helper needs to be deployed. Make sure `npx convex dev` is running.",
          "Start Convex Dev",
          "I'll start it myself"
        );

        if (action === "Start Convex Dev") {
          await this._startConvexDev();
          // Wait a moment for deployment
          await new Promise((r) => setTimeout(r, 5000));
          return true;
        }

        return action === "I'll start it myself";
      }

      case "convex_not_running": {
        const action = await vscode.window.showWarningMessage(
          "Cannot reach the Convex deployment. Is `npx convex dev` running?",
          "Start Convex Dev",
          "I'll start it myself"
        );

        if (action === "Start Convex Dev") {
          await this._startConvexDev();
          await new Promise((r) => setTimeout(r, 5000));
          return true;
        }

        return action === "I'll start it myself";
      }

      case "query_failed":
        vscode.window.showErrorMessage(`Query failed: ${error.message}`);
        return false;
    }
  }

  /**
   * List documents from a table with a limit.
   */
  async listDocs(
    table: string,
    limit: number = 50
  ): Promise<unknown[]> {
    const result = await this._run(".exconvex/_exconvex:_listDocs", {
      table,
      limit,
    });

    if (Array.isArray(result)) {
      return result;
    }
    return [];
  }

  /**
   * Get document counts for multiple tables.
   */
  async getTableCounts(
    tables: string[]
  ): Promise<Record<string, number>> {
    const result = await this._run(".exconvex/_exconvex:_tableCounts", { tables });

    if (result && typeof result === "object") {
      return result as Record<string, number>;
    }
    return {};
  }

  /**
   * Update a document field.
   */
  async updateDoc(
    table: string,
    id: string,
    field: string,
    value: unknown
  ): Promise<void> {
    await this._run(".exconvex/_exconvex:_updateDoc", { table, id, field, value });
  }

  /**
   * Create a new document.
   */
  async createDoc(
    table: string,
    document: Record<string, unknown>
  ): Promise<void> {
    await this._run(".exconvex/_exconvex:_createDoc", { table, document });
  }

  /**
   * Get a single document by ID.
   */
  async getDoc(table: string, id: string): Promise<unknown> {
    return await this._run(".exconvex/_exconvex:_getDoc", { table, id });
  }

  /**
   * Run a convex function via CLI and parse the JSON result.
   */
  private async _run(
    functionPath: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const deployment = this.connectionManager.activeDeployment;
    if (!deployment) {
      throw new Error("No deployment connected");
    }

    const convexDir = await findConvexProjectDir();
    if (!convexDir) {
      throw new Error("Could not find convex project directory");
    }

    const npxPath = process.platform === "win32" ? "npx.cmd" : "npx";
    const cliArgs = [
      "convex",
      "run",
      functionPath,
      JSON.stringify(args),
    ];

    if (deployment.url) {
      cliArgs.push("--url", deployment.url);
    }

    return new Promise<unknown>((resolve, reject) => {
      execFile(
        npxPath,
        cliArgs,
        {
          cwd: convexDir,
          timeout: 30000,
          env: { ...process.env, FORCE_COLOR: "0" },
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) {
            const msg = stderr?.trim() || error.message;
            reject(new Error(msg));
            return;
          }

          try {
            const parsed = JSON.parse(stdout.trim());
            resolve(parsed);
          } catch {
            resolve(stdout.trim());
          }
        }
      );
    });
  }

  private async _startConvexDev(): Promise<void> {
    const convexDir = await findConvexProjectDir();
    if (!convexDir) { return; }

    const terminal = vscode.window.createTerminal({
      name: "Convex Dev",
      cwd: convexDir,
    });
    terminal.show();
    terminal.sendText("npx convex dev");
  }
}
