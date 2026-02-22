import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import type { DeploymentTarget, DeploymentEnv } from "../shared/types";

const execFileAsync = promisify(execFile);

/**
 * Detect Convex deployments available in the current workspace
 * by inspecting .env.local and convex CLI output.
 */
export async function detectDeployments(): Promise<DeploymentTarget[]> {
  const targets: DeploymentTarget[] = [];

  // Try reading .env.local for CONVEX_URL
  const envTarget = await detectFromEnvFile();
  if (envTarget) {
    targets.push(envTarget);
  }

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

async function detectFromEnvFile(): Promise<DeploymentTarget | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {
    return null;
  }

  // Search for .env.local at any depth (monorepo support)
  const pattern = new vscode.RelativePattern(
    workspaceFolders[0],
    "**/.env.local"
  );
  const envFiles = await vscode.workspace.findFiles(
    pattern,
    "**/node_modules/**",
    10
  );

  for (const envUri of envFiles) {
    try {
      const content = await vscode.workspace.fs.readFile(envUri);
      const text = Buffer.from(content).toString("utf-8");

      const match = text.match(
        /CONVEX_URL\s*=\s*["']?(https?:\/\/[^\s"']+)["']?/
      );
      if (match) {
        const url = match[1];
        const env: DeploymentEnv = url.includes("localhost") ? "local" : "dev";
        // Derive project name from the directory containing .env.local
        const dirPath = envUri.fsPath.replace(/[/\\]\.env\.local$/, "");
        const projectName = dirPath.split(/[/\\]/).pop() ?? "unknown";
        return {
          id: `env-${env}-${projectName}`,
          env,
          url,
          projectName,
          connectedAt: 0,
        };
      }
    } catch {
      // File read failed
    }
  }
  return null;
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
