import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // consumir os tipos/dados compartilhados direto do TS-source do workspace
  transpilePackages: ["@pixel-idle/shared"],
};

export default nextConfig;
