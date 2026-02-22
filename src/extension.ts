import * as vscode from "vscode";
import { ConnectionManager } from "./connection";
import {
  DeploymentsProvider,
  TablesProvider,
  IndexesProvider,
  DriftProvider,
} from "./explorer";
import { parseConvexSchema, SnapshotStore, computeDrift } from "./schema";
import { analyzeIndexCoverage } from "./index-inspector";
import { QueryWatcher } from "./watch";
import { SchemaGraphPanel } from "./webview/SchemaGraphPanel";
import { IndexInspectorPanel } from "./webview/IndexInspectorPanel";
import { QueryWatchPanel } from "./webview/QueryWatchPanel";
import { DriftTimelinePanel } from "./webview/DriftTimelinePanel";
import { DocumentBrowserPanel } from "./webview/DocumentBrowserPanel";
import { ConvexDataClient, ensureHelperFile } from "./data";
import type {
  SchemaGraphDto,
  TableSchema,
  IndexDefinition,
  RelationEdge,
} from "./shared/types";

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  console.log("ExConvex extension activating...");

  // --- Core services ---
  const connectionManager = new ConnectionManager(context.secrets);
  const snapshotStore = new SnapshotStore(context.globalStorageUri);
  const queryWatcher = new QueryWatcher(connectionManager);
  const dataClient = new ConvexDataClient(connectionManager);

  await snapshotStore.initialize();

  // --- Tree view providers ---
  const deploymentsProvider = new DeploymentsProvider(connectionManager);
  const tablesProvider = new TablesProvider(connectionManager);
  const indexesProvider = new IndexesProvider(connectionManager);
  const driftProvider = new DriftProvider();

  vscode.window.registerTreeDataProvider(
    "exconvex.deploymentsView",
    deploymentsProvider
  );
  vscode.window.registerTreeDataProvider(
    "exconvex.tablesView",
    tablesProvider
  );
  vscode.window.registerTreeDataProvider(
    "exconvex.indexesView",
    indexesProvider
  );
  vscode.window.registerTreeDataProvider("exconvex.driftView", driftProvider);

  // --- Webview panels (lazy-created) ---
  let schemaGraphPanel: SchemaGraphPanel | undefined;
  let indexInspectorPanel: IndexInspectorPanel | undefined;
  let queryWatchPanel: QueryWatchPanel | undefined;
  let driftTimelinePanel: DriftTimelinePanel | undefined;
  let documentBrowserPanel: DocumentBrowserPanel | undefined;

  // --- Shared state ---
  let cachedTables: TableSchema[] = [];
  let cachedIndexes: IndexDefinition[] = [];
  let cachedRelations: RelationEdge[] = [];

  // --- Helper: refresh schema data ---
  async function refreshSchemaData(): Promise<void> {
    const result = await parseConvexSchema();
    cachedTables = result.tables;
    cachedIndexes = result.indexes;
    cachedRelations = result.relations;

    tablesProvider.setData(cachedTables, cachedIndexes);
    indexesProvider.setData(cachedIndexes);

    // Try to load live doc counts in the background
    loadDocCounts();
  }

  async function loadDocCounts(): Promise<void> {
    if (cachedTables.length === 0) {return;}
    try {
      const tableNames = cachedTables.map((t) => t.table);
      const counts = await dataClient.getTableCounts(tableNames);
      tablesProvider.setDocCounts(counts);
    } catch {
      // Data browsing not set up yet — that's fine, counts stay hidden
    }
  }

  // --- Helper: build graph DTO ---
  function buildGraphDto(): SchemaGraphDto {
    return {
      nodes: cachedTables.map((t) => ({
        id: t.table,
        table: t.table,
        fields: t.fields,
        indexCount: cachedIndexes.filter((i) => i.table === t.table).length,
      })),
      edges: cachedRelations.map((r, i) => ({
        id: `edge-${i}`,
        source: r.fromTable,
        target: r.toTable,
        sourceField: r.fromFieldPath,
        confidence: r.confidence,
        label: r.fromFieldPath,
      })),
    };
  }

  // --- Commands ---

  // Connect
  context.subscriptions.push(
    vscode.commands.registerCommand("exconvex.connect", async () => {
      const deployment = await connectionManager.connect();
      if (deployment) {
        await refreshSchemaData();
      }
    })
  );

  // Disconnect
  context.subscriptions.push(
    vscode.commands.registerCommand("exconvex.disconnectDeployment", () => {
      connectionManager.disconnect();
      cachedTables = [];
      cachedIndexes = [];
      cachedRelations = [];
      tablesProvider.setData([], []);
      indexesProvider.setData([]);
    })
  );

  // Open DB Explorer (triggers schema refresh + focuses tables view)
  context.subscriptions.push(
    vscode.commands.registerCommand("exconvex.openExplorer", async () => {
      if (!connectionManager.isConnected) {
        const shouldConnect = await vscode.window.showWarningMessage(
          "No deployment connected. Connect now?",
          "Connect",
          "Cancel"
        );
        if (shouldConnect === "Connect") {
          await vscode.commands.executeCommand("exconvex.connect");
        }
        return;
      }
      await refreshSchemaData();
      await vscode.commands.executeCommand("exconvex.tablesView.focus");
    })
  );

  // Refresh Schema Snapshot
  context.subscriptions.push(
    vscode.commands.registerCommand("exconvex.refreshSchema", async () => {
      if (!connectionManager.isConnected) {
        vscode.window.showWarningMessage("Connect to a deployment first.");
        return;
      }

      await refreshSchemaData();

      // Save a snapshot
      const deployment = connectionManager.activeDeployment!;
      const snapshot = snapshotStore.createSnapshot(
        deployment.id,
        cachedTables,
        cachedRelations
      );
      await snapshotStore.save(snapshot);
      driftProvider.addSnapshot(snapshot);

      // Update schema graph if open
      if (schemaGraphPanel) {
        schemaGraphPanel.updateGraph(buildGraphDto());
      }

      vscode.window.showInformationMessage(
        `Schema snapshot saved (${cachedTables.length} tables).`
      );
    })
  );

  // Open Schema Graph
  context.subscriptions.push(
    vscode.commands.registerCommand("exconvex.openSchemaGraph", async () => {
      if (!connectionManager.isConnected) {
        vscode.window.showWarningMessage("Connect to a deployment first.");
        return;
      }

      if (cachedTables.length === 0) {
        await refreshSchemaData();
      }

      if (!schemaGraphPanel) {
        schemaGraphPanel = new SchemaGraphPanel(context.extensionUri);
        schemaGraphPanel.onRefreshRequest(async () => {
          await refreshSchemaData();
          schemaGraphPanel!.updateGraph(buildGraphDto());
        });
        context.subscriptions.push(schemaGraphPanel);
      }

      schemaGraphPanel.show(vscode.ViewColumn.One);
      schemaGraphPanel.updateGraph(buildGraphDto());
    })
  );

  // Inspect Index Coverage
  context.subscriptions.push(
    vscode.commands.registerCommand("exconvex.inspectIndexes", async () => {
      if (!connectionManager.isConnected) {
        vscode.window.showWarningMessage("Connect to a deployment first.");
        return;
      }

      if (cachedIndexes.length === 0) {
        await refreshSchemaData();
      }

      if (!indexInspectorPanel) {
        indexInspectorPanel = new IndexInspectorPanel(context.extensionUri);
        indexInspectorPanel.onRefreshRequest(async () => {
          indexInspectorPanel!.postMessage({
            type: "loading",
            payload: { message: "Re-analyzing..." },
          });
          const findings = await analyzeIndexCoverage(cachedIndexes);
          indexInspectorPanel!.updateFindings(findings);
        });
        context.subscriptions.push(indexInspectorPanel);
      }

      indexInspectorPanel.show(vscode.ViewColumn.One);
      indexInspectorPanel.postMessage({
        type: "loading",
        payload: { message: "Analyzing index coverage..." },
      });

      const findings = await analyzeIndexCoverage(cachedIndexes);
      indexInspectorPanel.updateFindings(findings);
    })
  );

  // Watch Query Function
  context.subscriptions.push(
    vscode.commands.registerCommand("exconvex.watchQuery", async () => {
      if (!connectionManager.isConnected) {
        vscode.window.showWarningMessage("Connect to a deployment first.");
        return;
      }

      if (queryWatcher.isWatching) {
        queryWatcher.stopWatching();
        vscode.window.showInformationMessage("Query watch stopped.");
        return;
      }

      const functionName = await vscode.window.showInputBox({
        prompt: "Enter the query function name (e.g., messages:list)",
        placeHolder: "module:functionName",
        validateInput: (value) => {
          if (!value.includes(":") && !value.includes("/")) {
            return "Use format module:functionName (e.g., messages:list)";
          }
          return undefined;
        },
      });

      if (!functionName) {return;}

      if (!queryWatchPanel) {
        queryWatchPanel = new QueryWatchPanel(
          context.extensionUri,
          queryWatcher
        );
        context.subscriptions.push(queryWatchPanel);
      }

      queryWatchPanel.show(vscode.ViewColumn.Two);
      await queryWatcher.startWatching(functionName);
      vscode.window.showInformationMessage(
        `Watching query: ${functionName}`
      );
    })
  );

  // Compare Schema Snapshots
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "exconvex.compareSnapshots",
      async () => {
        const deploymentId = connectionManager.activeDeployment?.id;
        const snapshots = await snapshotStore.list(deploymentId);

        if (snapshots.length < 2) {
          vscode.window.showWarningMessage(
            "Need at least 2 snapshots to compare. Use 'Refresh Schema Snapshot' to create snapshots."
          );
          return;
        }

        // Pick two snapshots to compare
        const items = snapshots.map((s) => ({
          label: new Date(s.createdAt).toLocaleString(),
          description: `${s.tables.length} tables, ${s.relations.length} relations`,
          snapshot: s,
        }));

        const fromPick = await vscode.window.showQuickPick(items, {
          placeHolder: "Select the OLDER snapshot (from)",
        });
        if (!fromPick) {return;}

        const toItems = items.filter(
          (i) => i.snapshot.id !== fromPick.snapshot.id
        );
        const toPick = await vscode.window.showQuickPick(toItems, {
          placeHolder: "Select the NEWER snapshot (to)",
        });
        if (!toPick) {return;}

        const drift = computeDrift(fromPick.snapshot, toPick.snapshot);

        if (!driftTimelinePanel) {
          driftTimelinePanel = new DriftTimelinePanel(context.extensionUri);
          driftTimelinePanel.onRefreshRequest(async () => {
            await vscode.commands.executeCommand("exconvex.compareSnapshots");
          });
          context.subscriptions.push(driftTimelinePanel);
        }

        driftTimelinePanel.show(vscode.ViewColumn.One);
        driftTimelinePanel.updateDrift(drift);
      }
    )
  );

  // Export Current View
  context.subscriptions.push(
    vscode.commands.registerCommand("exconvex.exportView", async () => {
      const format = await vscode.window.showQuickPick(
        [
          { label: "JSON", format: "json" as const },
          { label: "SVG", format: "svg" as const },
          { label: "PNG", format: "png" as const },
        ],
        { placeHolder: "Select export format" }
      );

      if (!format) {return;}

      // Export the most recently active panel's data
      if (schemaGraphPanel) {
        schemaGraphPanel.postMessage({
          type: "loading",
          payload: { message: "Exporting..." },
        });
      }

      // For JSON, export schema data directly
      if (format.format === "json") {
        const exportData = {
          tables: cachedTables,
          indexes: cachedIndexes,
          relations: cachedRelations,
          exportedAt: new Date().toISOString(),
        };
        const doc = await vscode.workspace.openTextDocument({
          content: JSON.stringify(exportData, null, 2),
          language: "json",
        });
        await vscode.window.showTextDocument(doc);
      } else {
        vscode.window.showInformationMessage(
          `${format.label} export coming in a future update.`
        );
      }
    })
  );

  // Browse Table Data
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "exconvex.browseTable",
      async (tableName?: string, docCount?: number) => {
        // Pre-flight: check if data browsing is possible
        const readinessError = await dataClient.checkReadiness();
        if (readinessError) {
          const shouldRetry = await dataClient.fix(readinessError);
          if (!shouldRetry) {return;}

          // Re-check after fix
          const stillBroken = await dataClient.checkReadiness();
          if (stillBroken) {
            await dataClient.fix(stillBroken);
            return;
          }
        }

        // If no table name passed, prompt user to pick one
        if (!tableName) {
          if (cachedTables.length === 0) {
            await refreshSchemaData();
          }
          const items = cachedTables.map((t) => ({
            label: t.table,
            description: `${t.fields.length} fields`,
          }));
          const picked = await vscode.window.showQuickPick(items, {
            placeHolder: "Select a table to browse",
          });
          if (!picked) {return;}
          tableName = picked.label;
        }

        if (!documentBrowserPanel) {
          documentBrowserPanel = new DocumentBrowserPanel(
            context.extensionUri,
            dataClient
          );
          context.subscriptions.push(documentBrowserPanel);
        }

        await documentBrowserPanel.openTable(tableName, docCount);
      }
    )
  );

  // Setup Data Browser (creates helper file)
  context.subscriptions.push(
    vscode.commands.registerCommand("exconvex.setupDataBrowser", async () => {
      const result = await ensureHelperFile();
      if (result) {
        vscode.window.showInformationMessage(
          "Data browser helper is ready. Make sure 'npx convex dev' is running to deploy it."
        );
      }
    })
  );

  // --- Auto-reconnect on startup ---
  await connectionManager.tryReconnect();
  if (connectionManager.isConnected) {
    await refreshSchemaData();

    // Load existing snapshots
    const deploymentId = connectionManager.activeDeployment?.id;
    if (deploymentId) {
      const snapshots = await snapshotStore.list(deploymentId);
      driftProvider.setSnapshots(snapshots);
    }
  }

  // --- Register disposables ---
  context.subscriptions.push(connectionManager, queryWatcher);

  vscode.window.showInformationMessage("ExConvex extension activated");
  console.log("ExConvex extension activated");
}

export function deactivate(): void {
  console.log("ExConvex extension deactivated");
}
