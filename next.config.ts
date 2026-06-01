import type { NextConfig } from "next";
import path from "path";
import os from "os";

// Fully isolate all session histories, settings, and model configs under ~/.ink/agent/
process.env.PI_CODING_AGENT_DIR = path.join(os.homedir(), ".ink", "agent");

const nextConfig: NextConfig = {
  serverExternalPackages: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai"],
  allowedDevOrigins: ['192.168.*.*'],
};

export default nextConfig;
