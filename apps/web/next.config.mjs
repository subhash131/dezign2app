import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: [
    "@workspace/ui",
    "@workspace/canvas",
    "@wterm/dom",
    "@wterm/react",
  ],
  crossOrigin: "use-credentials",
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    mcpServer: true,
  },
};

export default nextConfig;
