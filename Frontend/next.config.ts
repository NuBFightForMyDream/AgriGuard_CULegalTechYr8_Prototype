import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A lockfile higher up the disk confuses workspace-root inference; pin it to this app.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
