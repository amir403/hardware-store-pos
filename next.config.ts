import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Phone photos are often 3–6 MB; they are shrunk to ~50 KB on arrival.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
