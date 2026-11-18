import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.open-next/**",
      "**/e2e/**",
      "**/*.spec.ts",
    ],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@workspace/ui": path.resolve(__dirname, "../../packages/ui/src"),
      "@workspace/backend": path.resolve(
        __dirname,
        "../../packages/backend/convex",
      ),
      // Force a single React across all packages (avoids "invalid hook call" from @workspace/ui)
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
  },
});
