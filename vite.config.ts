import { nodeExternals } from "rollup-plugin-node-externals";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["cjs"],
      fileName: "index",
    },
    outDir: distDir(mode),
    target: "node16",
    sourcemap: true,
    minify: mode === "production",
  },
  plugins: [
    // In dev we want to mark all dependencies as external to speed up builds.
    // In production we only want to mark Node.js built-ins and "vscode"
    // as external.
    nodeExternals({
      deps: mode !== "production",
      include: [
        // "vscode" is a virtual package provided by the VS Code runtime.
        "vscode",
      ],
    }),
  ],
}));

function distDir(mode: string): string {
  const segments = ["dist", modeToDistDirName(mode)];
  if (mode === "production") segments.push("pkg");
  return segments.join("/");
}

function modeToDistDirName(mode: string): "production" | "dev" {
  switch (mode) {
    case "production":
      return "production";
    case "development":
      return "dev";
    default:
      throw new Error(`Unknown mode: ${mode}`);
  }
}
