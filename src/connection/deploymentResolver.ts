import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import type { DeploymentTarget, DeploymentEnv } from "../shared/types";
import { findConvexEnvFiles } from "../convexProject";

const execFileAsync = promisify(execFile);

/**
 * Detect Convex deployments available in the current workspace
 * by inspecting .env.local and convex CLI output.
 */
export async function detectDeployments(): Promise<DeploymentTarget[]> {
  const targets: DeploymentTarget[] = [];

  // Try reading .env.local for CONVEX_URL (searches ALL workspace folders)
  const envTargets = await detectFromEnvFile();
  targets.push(...envTargets);

  // Try convex CLI to list dev deployments
  const cliTargets = await detectFromCli();
  targets.push(...cliTargets);

  // Deduplicate by URL
  const seen = new Set<string>();
  return targets.filter((t) => {
    const key = t.url ?? t.id;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function detectFromEnvFile(): Promise<DeploymentTarget[]> {
  const envResults = await findConvexEnvFiles();
  return envResults.map(({ url, projectName }) => {
    const env: DeploymentEnv = url.includes("localhost") ? "local" : "dev";
    return {
      id: `env-${env}-${projectName}`,
      env,
      url,
      projectName,
      connectedAt: 0,
    };
  });
}

async function detectFromCli(): Promise<DeploymentTarget[]> {
  const targets: DeploymentTarget[] = [];
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {
    return targets;
  }

  for (const folder of workspaceFolders) {
    try {
      const npxPath = process.platform === "win32" ? "npx.cmd" : "npx";
      const { stdout } = await execFileAsync(
        npxPath,
        ["convex", "dev", "--once", "--typecheck=disable", "--codegen=disable"],
        {
          cwd: folder.uri.fsPath,
          timeout: 15000,
          env: { ...process.env, FORCE_COLOR: "0" },
        }
      );

      // Parse URL from CLI output
      const urlMatch = stdout.match(/(https?:\/\/[^\s]+\.convex\.cloud[^\s]*)/);
      if (urlMatch) {
        targets.push({
          id: `cli-dev-${folder.name}`,
          env: "dev",
          url: urlMatch[1],
          projectName: folder.name,
          connectedAt: 0,
        });
      }
    } catch {
      // CLI might not be available or project not set up
    }
  }
  return targets;
}

/**
 * Prompt user to pick a deployment from detected options.
 */
export async function pickDeployment(
  targets: DeploymentTarget[]
): Promise<DeploymentTarget | undefined> {
  if (targets.length === 0) {
    const manualUrl = await vscode.window.showInputBox({
      prompt: "Enter your Convex deployment URL",
      placeHolder: "https://your-project.convex.cloud",
      validateInput: (value) => {
        if (!value.startsWith("http")) {
          return "URL must start with http:// or https://";
        }
        return undefined;
      },
    });

    if (!manualUrl) {
      return undefined;
    }

    const env: DeploymentEnv = manualUrl.includes("localhost")
      ? "local"
      : "dev";
    return {
      id: `manual-${env}-${Date.now()}`,
      env,
      url: manualUrl,
      connectedAt: Date.now(),
    };
  }

  if (targets.length === 1) {
    return { ...targets[0], connectedAt: Date.now() };
  }

  const items = targets.map((t) => ({
    label: `$(${t.env === "local" ? "home" : "cloud"}) ${t.projectName ?? t.id}`,
    description: `${t.env} — ${t.url ?? "unknown URL"}`,
    target: t,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a Convex deployment",
  });

  if (!picked) {
    return undefined;
  }

  return { ...picked.target, connectedAt: Date.now() };
}
