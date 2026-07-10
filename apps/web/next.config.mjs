/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  crossOrigin: "use-credentials",
  experimental: {
    mcpServer: true,
  },
};

export default nextConfig;
