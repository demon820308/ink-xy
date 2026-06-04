import { NextRequest, NextResponse } from "next/server";

declare global {
  var __piRegisteredCwds: Set<string> | undefined;
  var __piAllowedRootsCache: { roots: Set<string>; expiresAt: number } | undefined;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cwds = Array.isArray(body.cwds)
      ? body.cwds
      : body.cwd
      ? [body.cwd]
      : [];

    if (cwds.length === 0) {
      return NextResponse.json({ error: "创作工作区目录 (cwd) 不能为空" }, { status: 400 });
    }

    if (!globalThis.__piRegisteredCwds) {
      globalThis.__piRegisteredCwds = new Set<string>();
    }
    for (const c of cwds) {
      if (c) {
        globalThis.__piRegisteredCwds.add(c);
      }
    }

    // Expire the allowed roots cache so the files API will re-evaluate on next request
    if (globalThis.__piAllowedRootsCache) {
      globalThis.__piAllowedRootsCache.expiresAt = 0;
    }

    return NextResponse.json({ success: true, registered: cwds });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
