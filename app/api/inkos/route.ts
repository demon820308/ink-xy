import "@/lib/env-init";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";
import { resolveModelsEnv } from "@/lib/npx";

import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from "fs";

export const dynamic = "force-dynamic";

const SYNC_ACTIONS = new Set([
  "dashboard",
  "style-list",
  "style-switch",
  "book-delete",
  "get-facts",
  "update-fact",
  "add-fact",
  "delete-fact",
  "status",
  "export",
  "consolidate"
]);

export async function POST(request: NextRequest) {
  try {
    // Inject resolved model settings into environment so the spawned child process can read them
    const modelsEnv = resolveModelsEnv();
    const childEnv = {
      ...process.env,
      ...modelsEnv
    };

    const { action, cwd, args = {} } = await request.json();

    if (!cwd) {
      return NextResponse.json({ error: "创作工作区目录 (cwd) 不能为空" }, { status: 400 });
    }

    if (action === "dashboard") {
      const bookId = args.bookId;
      if (!bookId) {
        return NextResponse.json({ error: "书籍ID不能为空" }, { status: 400 });
      }

      const bookDir = join(cwd, "books", bookId);
      const indexPath = join(bookDir, "chapters", "index.json");

      let chapters = [];
      if (existsSync(indexPath)) {
        try {
          chapters = JSON.parse(readFileSync(indexPath, "utf8"));
        } catch (e) {
          console.error("[API/inkos] Failed to parse index.json:", e);
        }
      }

      const runtimeDir = join(bookDir, "story", "runtime");
      const snapshotsDir = join(bookDir, "story", "snapshots");

      // Fetch chapter summaries (mood, chapter_type) from memory.db index if exists
      const dbPath = join(bookDir, "story", "memory.db");
      const summariesMap: Record<number, { mood: string; chapterType: string }> = {};
      if (existsSync(dbPath)) {
        try {
          const { createRequire } = require("node:module");
          const requireESM = createRequire(import.meta.url);
          const { DatabaseSync } = requireESM("node:sqlite");
          const db = new DatabaseSync(dbPath);
          const rows = db.prepare("SELECT chapter, mood, chapter_type AS chapterType FROM chapter_summaries").all() as any[];
          for (const row of rows) {
            summariesMap[row.chapter] = {
              mood: row.mood || "",
              chapterType: row.chapterType || "",
            };
          }
          db.close();
        } catch (e) {
          console.error("[API/inkos] Failed to read memory.db summaries:", e);
        }
      }

      const dashboardData = chapters.map((ch: any) => {
        const num = ch.number;
        const padded = String(num).padStart(4, "0");

        const planFile = `chapter-${padded}.plan.md`;
        const intentFile = `chapter-${padded}.intent.md`;

        const hasPlan = existsSync(join(runtimeDir, planFile));
        const hasIntent = existsSync(join(runtimeDir, intentFile));

        const snapshotPath = join(snapshotsDir, String(num));
        let hasSnapshot = false;
        try {
          hasSnapshot = existsSync(snapshotPath) && statSync(snapshotPath).isDirectory();
        } catch {}

        const summary = summariesMap[num] || { mood: "", chapterType: "" };

        return {
          ...ch,
          hasPlan,
          hasIntent,
          hasSnapshot,
          mood: summary.mood,
          chapterType: summary.chapterType,
        };
      });

      const nextChapterNum = dashboardData.length > 0
        ? Math.max(...dashboardData.map((c: any) => c.number)) + 1
        : 1;
      const nextPadded = String(nextChapterNum).padStart(4, "0");
      const nextHasPlan = existsSync(join(runtimeDir, `chapter-${nextPadded}.plan.md`));
      const nextHasIntent = existsSync(join(runtimeDir, `chapter-${nextPadded}.intent.md`));

      return NextResponse.json({
        success: true,
        chapters: dashboardData,
        nextChapter: {
          number: nextChapterNum,
          hasPlan: nextHasPlan,
          hasIntent: nextHasIntent,
        },
      });
    }

    if (action === "get-facts") {
      const bookId = args.bookId;
      if (!bookId) {
        return NextResponse.json({ error: "书籍ID不能为空" }, { status: 400 });
      }
      const dbPath = join(cwd, "books", bookId, "story", "memory.db");
      if (!existsSync(dbPath)) {
        return NextResponse.json({ success: true, facts: [] });
      }
      try {
        const { createRequire } = require("node:module");
        const requireESM = createRequire(import.meta.url);
        const { DatabaseSync } = requireESM("node:sqlite");
        const db = new DatabaseSync(dbPath);
        
        let rows;
        if (typeof args.chapter === "number") {
          const ch = args.chapter;
          rows = db.prepare("SELECT id, subject, predicate, object, valid_from_chapter AS validFromChapter, valid_until_chapter AS validUntilChapter, source_chapter AS sourceChapter FROM facts WHERE valid_from_chapter <= ? AND (valid_until_chapter IS NULL OR valid_until_chapter >= ?)").all(ch, ch) as any[];
        } else {
          rows = db.prepare("SELECT id, subject, predicate, object, valid_from_chapter AS validFromChapter, valid_until_chapter AS validUntilChapter, source_chapter AS sourceChapter FROM facts").all() as any[];
        }
        db.close();
        return NextResponse.json({ success: true, facts: rows });
      } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message || String(e) }, { status: 500 });
      }
    }

    if (action === "update-fact") {
      const bookId = args.bookId;
      const factId = args.id;
      if (!bookId || !factId) {
        return NextResponse.json({ error: "书籍ID和事实ID不能为空" }, { status: 400 });
      }
      const dbPath = join(cwd, "books", bookId, "story", "memory.db");
      try {
        const { createRequire } = require("node:module");
        const requireESM = createRequire(import.meta.url);
        const { DatabaseSync } = requireESM("node:sqlite");
        const db = new DatabaseSync(dbPath);
        
        db.prepare("UPDATE facts SET valid_from_chapter = ?, valid_until_chapter = ?, object = ? WHERE id = ?").run(
          args.validFromChapter,
          args.validUntilChapter === null ? null : args.validUntilChapter,
          args.object,
          factId
        );
        db.close();
        return NextResponse.json({ success: true });
      } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message || String(e) }, { status: 500 });
      }
    }

    if (action === "add-fact") {
      const bookId = args.bookId;
      if (!bookId) {
        return NextResponse.json({ error: "书籍ID不能为空" }, { status: 400 });
      }
      const dbPath = join(cwd, "books", bookId, "story", "memory.db");
      try {
        const { createRequire } = require("node:module");
        const requireESM = createRequire(import.meta.url);
        const { DatabaseSync } = requireESM("node:sqlite");
        const db = new DatabaseSync(dbPath);
        
        db.prepare("INSERT INTO facts (subject, predicate, object, valid_from_chapter, valid_until_chapter, source_chapter) VALUES (?, ?, ?, ?, ?, ?)").run(
          args.subject,
          args.predicate,
          args.object,
          args.validFromChapter,
          args.validUntilChapter === null ? null : args.validUntilChapter,
          args.sourceChapter || 1
        );
        db.close();
        return NextResponse.json({ success: true });
      } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message || String(e) }, { status: 500 });
      }
    }

    if (action === "delete-fact") {
      const bookId = args.bookId;
      const factId = args.id;
      if (!bookId || !factId) {
        return NextResponse.json({ error: "书籍ID和事实ID不能为空" }, { status: 400 });
      }
      const dbPath = join(cwd, "books", bookId, "story", "memory.db");
      try {
        const { createRequire } = require("node:module");
        const requireESM = createRequire(import.meta.url);
        const { DatabaseSync } = requireESM("node:sqlite");
        const db = new DatabaseSync(dbPath);
        
        db.prepare("DELETE FROM facts WHERE id = ?").run(factId);
        db.close();
        return NextResponse.json({ success: true });
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
      }
    }

    if (action === "style-tune") {
      const bookId = args.bookId;
      const name = args.name;
      const { proseOrnate, dialogueRatio, clicheDensity } = args;

      if (!bookId || !name) {
        return NextResponse.json({ error: "书籍ID和风格名称不能为空" }, { status: 400 });
      }

      try {
        const storyDir = join(cwd, "books", bookId, "story");
        const stylesDir = join(storyDir, "styles");

        if (!existsSync(stylesDir)) {
          mkdirSync(stylesDir, { recursive: true });
        }

        const styleJsonPath = join(stylesDir, `${name}.json`);
        const styleMdPath = join(stylesDir, `${name}.md`);

        // 1. Save style JSON config
        const tuneData = { proseOrnate, dialogueRatio, clicheDensity };
        writeFileSync(styleJsonPath, JSON.stringify(tuneData, null, 2), "utf8");

        // 2. Read original md template
        let mdContent = "";
        if (existsSync(styleMdPath)) {
          mdContent = readFileSync(styleMdPath, "utf8");
        } else {
          const activeGuidePath = join(storyDir, "style_guide.md");
          if (existsSync(activeGuidePath)) {
            mdContent = readFileSync(activeGuidePath, "utf8");
            writeFileSync(styleMdPath, mdContent, "utf8");
          }
        }

        // 3. Prepend/update the active style guide if it is the active style
        const activeGuidePath = join(storyDir, "style_guide.md");
        const activeProfilePath = join(storyDir, "style_profile.json");

        let isActive = false;
        if (existsSync(activeGuidePath)) {
          const content = readFileSync(activeGuidePath, "utf8");
          const match = content.match(/>\s*Profile:\s*\*\*([^*]+)\*\*/i);
          const activeName = match ? match[1].trim() : "default";
          if (activeName === name) {
            isActive = true;
          }
        } else if (name === "default") {
          isActive = true;
        }

        if (isActive || name === "default") {
          const tuneStartMarker = "<!-- STYLE_TUNE_START -->";
          const tuneEndMarker = "<!-- STYLE_TUNE_END -->";
          const startIndex = mdContent.indexOf(tuneStartMarker);
          const endIndex = mdContent.indexOf(tuneEndMarker);

          if (startIndex !== -1 && endIndex !== -1) {
            mdContent = mdContent.slice(endIndex + tuneEndMarker.length).trim();
          }

          const tuneBlock = `${tuneStartMarker}
# 写作特性微调参数
* **辞藻华丽度 (Ornateness)**: ${proseOrnate}% (值低趋于白描口语，值高使用大量华丽意象与精细景物描摹)
* **对话密集度 (Dialogue Ratio)**: ${dialogueRatio}% (高值以人物对白推动叙事，低值偏向大段独白、动作和内心戏)
* **修辞套话屏蔽度 (Cliché Filter)**: ${clicheDensity}% (高值强化对陈词滥调和疲劳词的拦截和规避)

---
${tuneEndMarker}\n\n`;

          const finalMdContent = tuneBlock + mdContent;
          writeFileSync(activeGuidePath, finalMdContent, "utf8");

          let profile = {};
          if (existsSync(activeProfilePath)) {
            try {
              profile = JSON.parse(readFileSync(activeProfilePath, "utf8"));
            } catch {}
          }
          Object.assign(profile, tuneData);
          writeFileSync(activeProfilePath, JSON.stringify(profile, null, 2), "utf8");
        }

        return NextResponse.json({ success: true });
      } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message || String(e) }, { status: 500 });
      }
    }

    const scriptPath = join(process.cwd(), "inkos", "skills", "scripts", "index.js");

    // Spawn the node process calling the Skill script
    const child = spawn(process.execPath, [scriptPath, action, JSON.stringify(args), "--cwd", cwd], {
      cwd,
      env: childEnv
    });

    if (SYNC_ACTIONS.has(action)) {
      // Synchronous execution: wait for exit and parse JSON result
      return new Promise<Response>((resolve) => {
        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });

        child.on("close", (code) => {
          const resultMarker = "--- RESULT ---";
          const markerIndex = stdout.lastIndexOf(resultMarker);
          let resultObj: Record<string, unknown> = { success: code === 0 };

          if (markerIndex !== -1) {
            const jsonStr = stdout.slice(markerIndex + resultMarker.length).trim();
            try {
              resultObj = extractJSON(jsonStr);
            } catch (e) {
              console.error(`[API/inkos] Failed to parse JSON result for ${action}:`, e);
              resultObj = { success: false, error: "Failed to parse result JSON", stdout, stderr };
            }
          } else {
            resultObj = { success: code === 0, error: stderr.trim() || "Process exited without result block", stdout, stderr };
          }

          if (code !== 0 || resultObj.success === false) {
            resolve(NextResponse.json(resultObj, { status: 500 }));
          } else {
            resolve(NextResponse.json(resultObj));
          }
        });
      });
    }

    // Streaming execution: return ReadableStream (NDJSON format)
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: Record<string, unknown>) => {
          try {
            controller.enqueue(new TextEncoder().encode(JSON.stringify(obj) + "\n"));
          } catch {
            // ignore
          }
        };

        let stdoutAccumulator = "";
        let stderrAccumulator = "";

        child.stdout.on("data", (chunk) => {
          const text = chunk.toString();
          stdoutAccumulator += text;
          send({ type: "stdout", data: text });
        });

        child.stderr.on("data", (chunk) => {
          const text = chunk.toString();
          stderrAccumulator += text;
          send({ type: "stdout", data: text });
        });

        child.on("close", (code) => {
          const resultMarker = "--- RESULT ---";
          const markerIndex = stdoutAccumulator.lastIndexOf(resultMarker);
          let resultObj: Record<string, unknown> = { success: code === 0 };

          if (markerIndex !== -1) {
            const jsonStr = stdoutAccumulator.slice(markerIndex + resultMarker.length).trim();
            try {
              resultObj = extractJSON(jsonStr);
            } catch (e) {
              console.error(`[API/inkos] Failed to parse streaming JSON result for ${action}:`, e);
              resultObj = { success: false, error: "Failed to parse result JSON" };
            }
          }

          send({
            type: "result",
            success: code === 0 && resultObj.success !== false,
            stdout: stdoutAccumulator,
            stderr: stderrAccumulator,
            code: code ?? 0,
            ...resultObj
          });
          controller.close();
        });
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (error) {
    const err = error as Error;
    console.error("[API/inkos] Execution failed:", err);
    return NextResponse.json({
      success: false,
      error: err.message || String(err),
    }, { status: 500 });
  }
}

function extractJSON(content: string): Record<string, unknown> {
  const firstBrace = content.indexOf("{");
  const firstBracket = content.indexOf("[");
  const startChar = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? "{" : "[";
  const endChar = startChar === "{" ? "}" : "]";
  const startIndex = startChar === "{" ? firstBrace : firstBracket;

  if (startIndex === -1) {
    throw new Error("No JSON start character found");
  }

  const endIndices: number[] = [];
  let index = content.indexOf(endChar, startIndex);
  while (index !== -1) {
    endIndices.push(index);
    index = content.indexOf(endChar, index + 1);
  }

  let lastError: any = null;
  for (let i = endIndices.length - 1; i >= 0; i--) {
    const candidate = content.slice(startIndex, endIndices[i] + 1);
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("No valid JSON substring found");
}

