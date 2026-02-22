const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  const ctx = await esbuild.context({
    entryPoints: [
      "src/webview/panels/schemaGraph/index.tsx",
      "src/webview/panels/indexInspector/index.tsx",
      "src/webview/panels/queryWatch/index.tsx",
      "src/webview/panels/driftTimeline/index.tsx",
      "src/webview/panels/documentBrowser/index.tsx",
    ],
    bundle: true,
    format: "esm",
    minify: production,
    sourcemap: !production,
    platform: "browser",
    outdir: "dist/webview",
    jsx: "automatic",
    external: [],
    logLevel: "info",
    loader: {
      ".css": "css",
    },
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
