import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  experimental: {
    // Pièces des dossiers (Paramétrage › Pièces, 20 Mo au plus) envoyées par
    // action serveur ; la limite par défaut est de 1 Mo.
    serverActions: { bodySizeLimit: "21mb" },
  },
  eslint: {
    // Lint is run as a dedicated CI step (npm run lint)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
