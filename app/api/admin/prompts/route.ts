import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PROMPTS_ROOT = path.resolve(
  process.env.APP_ROOT || process.cwd(),
  "inkos",
  "skills",
  "genres",
  "prompts"
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Recursively collect all `.md` files under dir, excluding `.default.md` */
function collectPromptFiles(dir: string, base = ""): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectPromptFiles(path.join(dir, entry.name), rel));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".md") &&
      !entry.name.endsWith(".default.md")
    ) {
      results.push(rel);
    }
  }
  return results;
}

/** Classify a prompt filename into a human-readable category */
function classifyPrompt(relPath: string): string {
  const name = path.basename(relPath).toLowerCase();
  if (name.startsWith("planner_")) return "Planner";
  if (name.startsWith("writer_")) return "Writer";
  if (name.startsWith("auditor_")) return "Auditor";
  if (name.startsWith("architect_")) return "Architect";
  if (name.startsWith("analyzer_")) return "Analyzer";
  if (name.startsWith("observer_")) return "Observer";
  if (name.startsWith("detector_")) return "Detector";
  if (name.startsWith("polisher_")) return "Polisher";
  if (name.startsWith("settler_")) return "Settler";
  if (name.startsWith("reviser_")) return "Reviser";
  if (name.startsWith("sf_") || relPath.includes("short_fiction"))
    return "Short Fiction";
  if (name.startsWith("fanfic_")) return "Fanfic";
  if (name.startsWith("foundation_")) return "Foundation";
  if (name.startsWith("state_validator")) return "Validator";
  if (name.startsWith("consolidator")) return "Consolidator";
  if (name.startsWith("length_normalizer")) return "Normalizer";
  if (name.startsWith("book_draft")) return "Draft Helper";
  if (name.startsWith("canon_reference")) return "Canon";
  if (name.startsWith("style_guide")) return "Style Guide";
  if (name.startsWith("workbench")) return "Workbench";
  if (name.startsWith("radar")) return "Radar";
  return "General";
}

/** Extract language tag from filename (_en, _zh, or neutral) */
function detectLanguage(relPath: string): string {
  const base = path.basename(relPath, ".md");
  if (base.endsWith("_en")) return "en";
  if (base.endsWith("_zh")) return "zh";
  return "neutral";
}

/** Resolve & validate a relative prompt path against the root — prevent traversal */
function safeResolve(relPath: string): string | null {
  const resolved = path.resolve(PROMPTS_ROOT, relPath);
  if (!resolved.startsWith(PROMPTS_ROOT + path.sep) && resolved !== PROMPTS_ROOT) {
    return null;
  }
  return resolved;
}

/* ------------------------------------------------------------------ */
/*  GET /api/admin/prompts                                             */
/*  GET /api/admin/prompts?name=<relativePath>                         */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");

  /* --- Single-file mode --- */
  if (name) {
    const filePath = safeResolve(name);
    if (!filePath) {
      return NextResponse.json(
        { error: "Invalid path: directory traversal detected" },
        { status: 400 }
      );
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const defaultPath = filePath.replace(/\.md$/, ".default.md");

    // Auto-backup on first read if no default exists
    if (!fs.existsSync(defaultPath)) {
      fs.copyFileSync(filePath, defaultPath);
    }

    const defaultContent = fs.readFileSync(defaultPath, "utf-8");

    return NextResponse.json({
      success: true,
      name,
      content,
      defaultContent,
      isModified: content !== defaultContent,
    });
  }

  /* --- List mode --- */
  try {
    const relPaths = collectPromptFiles(PROMPTS_ROOT);

    const prompts = relPaths.map((rel) => {
      const absPath = path.join(PROMPTS_ROOT, rel);
      const content = fs.readFileSync(absPath, "utf-8");
      const defaultPath = absPath.replace(/\.md$/, ".default.md");

      // Auto-backup if missing
      if (!fs.existsSync(defaultPath)) {
        fs.copyFileSync(absPath, defaultPath);
      }

      const defaultContent = fs.readFileSync(defaultPath, "utf-8");

      return {
        name: rel,
        category: classifyPrompt(rel),
        language: detectLanguage(rel),
        isModified: content !== defaultContent,
        size: Buffer.byteLength(content, "utf-8"),
      };
    });

    return NextResponse.json({ success: true, prompts });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/admin/prompts                                            */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      action?: "save" | "restore";
      content?: string;
    };

    const { name, action, content } = body;

    if (!name || !action) {
      return NextResponse.json(
        { error: "name and action are required" },
        { status: 400 }
      );
    }

    const filePath = safeResolve(name);
    if (!filePath) {
      return NextResponse.json(
        { error: "Invalid path: directory traversal detected" },
        { status: 400 }
      );
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const defaultPath = filePath.replace(/\.md$/, ".default.md");

    if (action === "save") {
      if (content === undefined || content === null) {
        return NextResponse.json(
          { error: "content is required for save action" },
          { status: 400 }
        );
      }

      // Ensure a backup exists before overwriting
      if (!fs.existsSync(defaultPath)) {
        fs.copyFileSync(filePath, defaultPath);
      }

      fs.writeFileSync(filePath, content, "utf-8");
      return NextResponse.json({ success: true, message: "Saved successfully" });
    }

    if (action === "restore") {
      if (!fs.existsSync(defaultPath)) {
        return NextResponse.json(
          { error: "No default backup found — cannot restore" },
          { status: 404 }
        );
      }

      const defaultContent = fs.readFileSync(defaultPath, "utf-8");
      fs.writeFileSync(filePath, defaultContent, "utf-8");
      return NextResponse.json({
        success: true,
        message: "Restored to default",
        content: defaultContent,
      });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
