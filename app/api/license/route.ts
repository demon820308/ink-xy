import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { homedir } from "os";
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "fs";
import { getMachineUuid } from "@/lib/machine";

const LICENSE_PATH = join(homedir(), ".ink", "agent", "license.json");
const CLOUDFLARE_API_URL = "https://inkxy.ipanic.bond";

// Helper to ensure parent directory exists
function ensureDirectoryExists(filePath: string) {
  const dir = join(filePath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Helper to check license locally (parse local JSON and check expiration)
function getLocalLicense() {
  if (!existsSync(LICENSE_PATH)) {
    return { active: false };
  }
  try {
    const raw = readFileSync(LICENSE_PATH, "utf8");
    const data = JSON.parse(raw);
    if (!data.key || !data.token || !data.expires_at) {
      return { active: false };
    }
    // Compare current time with expires_at
    const now = new Date();
    const expiresAt = new Date(data.expires_at);
    if (now > expiresAt) {
      // License expired locally
      try {
        unlinkSync(LICENSE_PATH);
      } catch (err) {}
      return { active: false, expired: true };
    }
    return { active: true, key: data.key, token: data.token, expires_at: data.expires_at };
  } catch (e) {
    console.error("Error reading local license:", e);
    return { active: false };
  }
}

// Helper to check if license requirement is bypassed on remote server
async function checkBypass(): Promise<boolean> {
  try {
    const response = await fetch(`${CLOUDFLARE_API_URL}/api/status`, {
      method: "GET",
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(2000) // 2s timeout
    });
    if (response.ok) {
      const data = await response.json() as any;
      return data.require_key === false;
    }
  } catch (err) {
    console.warn("Failed to check remote license status, falling back to local check:", err);
  }
  return false;
}

// API GET: Get local license status
export async function GET() {
  const machineUuid = getMachineUuid();
  if (await checkBypass()) {
    return NextResponse.json({
      active: true,
      key: "SYSTEM-BYPASS-ACTIVE",
      expires_at: "9999-12-31T23:59:59Z",
      machine_uuid: machineUuid,
      bypass: true
    });
  }
  const local = getLocalLicense();
  return NextResponse.json({ ...local, machine_uuid: machineUuid });
}

// API POST: Handle activation or online verification check
export async function POST(req: NextRequest) {
  try {
    const { key, action } = await req.json();
    const machineUuid = getMachineUuid();

    // 1. Online Verification Action (recheck if key is still active in remote DB)
    if (action === "verify") {
      if (await checkBypass()) {
        return NextResponse.json({ active: true, expires_at: "9999-12-31T23:59:59Z", bypass: true });
      }

      const local = getLocalLicense();
      if (!local.active || !local.key || !local.token) {
        return NextResponse.json({ active: false, message: "本地未激活" }, { status: 400 });
      }

      try {
        const response = await fetch(`${CLOUDFLARE_API_URL}/api/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: local.key,
            token: local.token,
            machine_uuid: machineUuid
          }),
          signal: AbortSignal.timeout(4000) // 4s timeout to prevent hanging on poor network
        });

        const resData = await response.json() as any;

        if (response.ok && resData.success) {
          // Successfully verified online
          return NextResponse.json({ active: true, expires_at: resData.expires_at });
        } else {
          // Key was revoked/disabled on the server, delete local license
          try {
            if (existsSync(LICENSE_PATH)) unlinkSync(LICENSE_PATH);
          } catch (e) {}
          return NextResponse.json({ active: false, message: resData.message || "远程验证未通过，授权已被吊销" }, { status: 403 });
        }
      } catch (err) {
        // Network timeout/offline: Fall back to local check (resilience for offline environments)
        console.warn("Online verify timed out or offline, falling back to local JWT check:", err);
        return NextResponse.json({
          active: true,
          offline: true,
          expires_at: local.expires_at,
          message: "网络连接失败，已启用离线授权本地缓存"
        });
      }
    }

    // 2. Activation Action
    if (!key) {
      return NextResponse.json({ success: false, message: "激活码不能为空" }, { status: 400 });
    }

    try {
      const response = await fetch(`${CLOUDFLARE_API_URL}/api/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          machine_uuid: machineUuid
        }),
        signal: AbortSignal.timeout(5000)
      });

      const resData = await response.json() as any;

      if (response.ok && resData.success) {
        // Save the license key and signed JWT token locally
        ensureDirectoryExists(LICENSE_PATH);
        writeFileSync(LICENSE_PATH, JSON.stringify({
          key,
          token: resData.token,
          expires_at: resData.expires_at
        }, null, 2), "utf8");

        return NextResponse.json({
          success: true,
          message: "激活成功",
          expires_at: resData.expires_at
        });
      } else {
        return NextResponse.json({
          success: false,
          message: resData.message || "激活失败，请检查激活码输入"
        }, { status: response.status });
      }
    } catch (err: any) {
      console.error("Online activation failed:", err);
      return NextResponse.json({
        success: false,
        message: "激活接口请求超时，请检查网络连接是否正常"
      }, { status: 504 });
    }

  } catch (error: any) {
    console.error("License API error:", error);
    return NextResponse.json({ success: false, message: "内部服务器错误: " + error.message }, { status: 500 });
  }
}

// API DELETE: Remove license locally (Unbind/Logout)
export async function DELETE() {
  try {
    if (existsSync(LICENSE_PATH)) {
      unlinkSync(LICENSE_PATH);
    }
    return NextResponse.json({ success: true, message: "授权已成功解除，本地缓存已清除" });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: "解除授权失败: " + err.message }, { status: 500 });
  }
}
