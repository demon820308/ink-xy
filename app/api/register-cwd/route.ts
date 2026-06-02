import { NextRequest, NextResponse } from "next/server";

declare global {
  var __piRegisteredCwds: Set<string> | undefined;
  var __piAllowedRootsCache: { roots: Set<string>; expiresAt: number } | undefined;
}

export async function POST(request: NextRequest) {
  try {
    const { cwd } = await request.json();
    if (!cwd) {
      return NextResponse.json({ error: "创作工作区目录 (cwd) 不能为空" }, { status: 400 });
    }

    if (!globalThis.__piRegisteredCwds) {
      globalThis.__piRegisteredCwds = new Set<string>();
    }
    globalThis.__piRegisteredCwds.add(cwd);

    // Expire the allowed roots cache so the files API will re-evaluate on next request
    if (globalThis.__piAllowedRootsCache) {
      globalThis.__piAllowedRootsCache.expiresAt = 0;
    }

    return NextResponse.json({ success: true, registered: cwd });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
