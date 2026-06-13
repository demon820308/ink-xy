import { NextRequest, NextResponse } from "next/server";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import "@/lib/env-init";

export const dynamic = "force-dynamic";

// DELETE /api/genres/[id]?cwd=<cwd>
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(request.url);
  const cwd = searchParams.get("cwd");
  if (!cwd) {
    return NextResponse.json({ error: "cwd required" }, { status: 400 });
  }

  const { id } = await params;
  const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleanId || cleanId !== id) {
    return NextResponse.json({ error: "Invalid genre ID" }, { status: 400 });
  }

  try {
    const filePath = join(cwd, "genres", `${cleanId}.md`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      return NextResponse.json({ success: true, message: "Customized genre deleted. Reverted to built-in default." });
    } else {
      return NextResponse.json({ error: "Custom genre file not found" }, { status: 404 });
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
