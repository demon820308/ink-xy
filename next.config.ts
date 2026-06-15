import type { NextConfig } from "next";
import path from "path";
import os from "os";

// Fully isolate all session histories, settings, and model configs under ~/.ink/agent/
process.env.PI_CODING_AGENT_DIR = path.join(os.homedir(), ".ink", "agent");

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: [
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-ai",
    "@mariozechner/pi-ai",
    "@mariozechner/pi-agent-core",
    "@actalk/inkos-core"
  ],
  allowedDevOrigins: ['192.168.*.*'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push(
          "@actalk/inkos-core",
          "@mariozechner/pi-ai",
          "@mariozechner/pi-agent-core"
        );
      } else if (typeof config.externals === "object" && config.externals !== null) {
        Object.assign(config.externals, {
          "@actalk/inkos-core": "commonjs @actalk/inkos-core",
          "@mariozechner/pi-ai": "commonjs @mariozechner/pi-ai",
          "@mariozechner/pi-agent-core": "commonjs @mariozechner/pi-agent-core",
        });
      }
    }
    return config;
  },
};

export default nextConfig;
