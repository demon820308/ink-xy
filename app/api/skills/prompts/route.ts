import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import "@/lib/env-init";

export const dynamic = "force-dynamic";

function getPromptsDir(): string {
  const rootDir = process.env.APP_ROOT || process.cwd();
  return path.join(rootDir, "inkos/skills/genres/prompts");
}

function resolveFilePath(name: string, lang?: string): { filePath: string; defaultPath: string; error?: string } {
  // Validate name to prevent directory traversal
  const cleanName = name.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleanName || cleanName !== name || name === "." || name === "..") {
    return { filePath: "", defaultPath: "", error: "Invalid prompt name" };
  }

  let fileName = name;
  if (lang && (name === "auditor_system" || name === "detector_system")) {
    fileName = `${name}_${lang}`;
  }
  fileName = `${fileName}.md`;

  const promptsDir = getPromptsDir();
  const filePath = path.join(promptsDir, fileName);
  const defaultPath = path.join(promptsDir, fileName.replace(/\.md$/, ".default.md"));

  return { filePath, defaultPath };
}

// GET /api/skills/prompts?name=<name>&lang=<lang>
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  const lang = searchParams.get("lang") || undefined;

  if (!name) {
    return NextResponse.json({ error: "name parameter required" }, { status: 400 });
  }

  const { filePath, defaultPath, error } = resolveFilePath(name, lang);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Prompt file not found" }, { status: 404 });
    }

    // Auto-create backup on first read if it doesn't exist
    if (!fs.existsSync(defaultPath)) {
      fs.copyFileSync(filePath, defaultPath);
    }

    const content = fs.readFileSync(filePath, "utf8");
    return NextResponse.json({ success: true, content });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/skills/prompts
export async function POST(request: NextRequest) {
  try {
    const { name, lang, content, action } = await request.json() as {
      name: string;
      lang?: string;
      content?: string;
      action: "save" | "restore";
    };

    if (!name || !action) {
      return NextResponse.json({ error: "name and action are required" }, { status: 400 });
    }

    const { filePath, defaultPath, error } = resolveFilePath(name, lang);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    if (action === "restore") {
      if (!fs.existsSync(defaultPath)) {
        return NextResponse.json({ error: "Default backup file not found" }, { status: 400 });
      }
      const defaultContent = fs.readFileSync(defaultPath, "utf8");
      fs.writeFileSync(filePath, defaultContent, "utf8");
      return NextResponse.json({ success: true, content: defaultContent });
    }

    if (action === "save") {
      if (content === undefined) {
        return NextResponse.json({ error: "content required for save action" }, { status: 400 });
      }
      fs.writeFileSync(filePath, content, "utf8");
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
