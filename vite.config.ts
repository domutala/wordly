import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    assetsDir: "assets", // optionnel, pour être explicite
    sourcemap: true, // <— important pour debugger TS
    rollupOptions: {
      input: {
        background: "src/background.ts",
        popup: "src/popup/popup.html",
        content: "src/content-script.ts",
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name].js",
        assetFileNames: "assets/[name][extname]", // ← CSS émis en assets/
      },
    },
  },
});
