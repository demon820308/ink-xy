import { execSync } from "child_process";
import { join } from "path";
import { homedir } from "os";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import crypto from "crypto";

/**
 * Retrieves a stable, persistent, hardware-linked computer UUID.
 * Supports Windows Registry, macOS ioreg, Linux machine-id, and a persistent fallback file.
 */
export function getMachineUuid(): string {
  try {
    if (process.platform === "win32") {
      // Windows: query Cryptography registry key
      const output = execSync('reg query HKLM\\Software\\Microsoft\\Cryptography /v MachineGuid', {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2000
      });
      const match = output.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
      if (match) return match[0].toLowerCase();
    } else if (process.platform === "darwin") {
      // macOS: query IOPlatformExpertDevice
      const output = execSync("ioreg -rd1 -c IOPlatformExpertDevice", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2000
      });
      const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/i);
      if (match) return match[1].toLowerCase();
    } else {
      // Linux: read standard machine-id files
      if (existsSync("/var/lib/dbus/machine-id")) {
        return readFileSync("/var/lib/dbus/machine-id", "utf8").trim().toLowerCase();
      }
      if (existsSync("/etc/machine-id")) {
        return readFileSync("/etc/machine-id", "utf8").trim().toLowerCase();
      }
    }
  } catch (e) {
    console.error("[Machine UUID Resolution failed, falling back to file ID]:", e);
  }

  // Fallback: Generate a persistent random UUID stored in ~/.ink/agent/.machine_id
  const agentDir = join(homedir(), ".ink", "agent");
  const fallbackPath = join(agentDir, ".machine_id");

  try {
    if (existsSync(fallbackPath)) {
      return readFileSync(fallbackPath, "utf8").trim().toLowerCase();
    }

    if (!existsSync(agentDir)) {
      mkdirSync(agentDir, { recursive: true });
    }

    const newId = crypto.randomUUID().toLowerCase();
    writeFileSync(fallbackPath, newId, "utf8");
    return newId;
  } catch (err) {
    console.error("Failed to read/write fallback machine ID file:", err);
    // Hard fallback: return a session-level UUID if even writing to disk fails
    return "fallback-uuid-" + Math.random().toString(36).substring(2, 15);
  }
}
