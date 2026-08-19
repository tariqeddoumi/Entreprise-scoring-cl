import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  eslint: {
    // Lint is run as a dedicated CI step (npm run lint)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
