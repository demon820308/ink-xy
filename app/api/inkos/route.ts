import { NextRequest, NextResponse } from "next/server";
import { runInkos, spawnInkos } from "@/lib/npx";
import { existsSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { action, cwd, args = {} } = await request.json();

    if (!cwd) {
      return NextResponse.json({ error: "创作工作区目录 (cwd) 不能为空" }, { status: 400 });
    }

    // Verify cwd exists before running commands
    if (!existsSync(cwd)) {
      return NextResponse.json({ error: `创作工作区目录不存在: ${cwd}` }, { status: 400 });
    }

    let cliArgs: string[] = [];
    let tempBriefPath: string | null = null;
    let localFilesUsed: string[] = [];

    switch (action) {
      case "init":
        cliArgs = ["init"];
        if (args.name) {
          cliArgs.push(args.name);
        }
        break;

      case "book-create":
        if (!args.title) {
          return NextResponse.json({ error: "书籍标题不能为空" }, { status: 400 });
        }
        cliArgs = ["book", "create", "--title", args.title];
        if (args.genre) {
          cliArgs.push("--genre", args.genre);
        }

        // Scan for local framework and character profile files to use as basis
        let combinedBrief = args.brief || "";
        try {
          const fs = require("fs");
          const searchDirs = [cwd, join(cwd, "Temp"), join(cwd, "temp")];
          const frameworkNames = ["novel_framework_v2.md", "novel_framework.md", "novel-framework.md", "架构.md", "构架.md"];
          const characterNames = ["character_profiles.md", "character-profiles.md", "character.md", "人设.md"];
          
          let foundFramework = "";
          let foundCharacter = "";
          
          // Find framework
          for (const dir of searchDirs) {
            if (!fs.existsSync(dir)) continue;
            for (const name of frameworkNames) {
              const fullPath = join(dir, name);
              if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                foundFramework = fs.readFileSync(fullPath, "utf8");
                localFilesUsed.push(join(dir === cwd ? "" : (dir.endsWith("Temp") ? "Temp" : "temp"), name).replace(/\\/g, "/"));
                break;
              }
            }
            if (foundFramework) break;
          }
          
          // Find character profiles
          for (const dir of searchDirs) {
            if (!fs.existsSync(dir)) continue;
            for (const name of characterNames) {
              const fullPath = join(dir, name);
              if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                foundCharacter = fs.readFileSync(fullPath, "utf8");
                localFilesUsed.push(join(dir === cwd ? "" : (dir.endsWith("Temp") ? "Temp" : "temp"), name).replace(/\\/g, "/"));
                break;
              }
            }
            if (foundCharacter) break;
          }
          
          if (foundFramework || foundCharacter) {
            const sections = [];
            if (foundFramework) {
              sections.push(`# 导入的构架设定\n\n${foundFramework}`);
            }
            if (foundCharacter) {
              sections.push(`# 导入的角色人设\n\n${foundCharacter}`);
            }
            if (args.brief) {
              sections.push(`# 用户补充创意\n\n${args.brief}`);
            }
            combinedBrief = sections.join("\n\n---\n\n");
            console.log(`[API/inkos] Book create using files: ${localFilesUsed.join(", ")}`);
          }
        } catch (err) {
          console.error("[API/inkos] Failed to scan local framework/character files:", err);
        }

        if (combinedBrief) {
          try {
            const fs = require("fs");
            tempBriefPath = join(cwd, "radar", `temp_brief_${Date.now()}.md`);
            fs.writeFileSync(tempBriefPath, combinedBrief, "utf8");
            cliArgs.push("--brief", tempBriefPath);
          } catch (e: any) {
            return NextResponse.json({ error: `无法写入创意简报临时文件: ${e.message}` }, { status: 500 });
          }
        }
        if (args.chapterWords) {
          cliArgs.push("--chapter-words", String(args.chapterWords));
        }
        break;

      case "write-next": {
        cliArgs = ["write", "next"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        if (args.count) {
          cliArgs.push("--count", String(args.count));
        }
        if (args.words) {
          cliArgs.push("--words", String(args.words));
        }
        if (args.json) {
          cliArgs.push("--json");
        }

        // --- Auto-healing / Gap Detection logic ---
        const bookId = args.bookId;
        const activeChapter = args.activeChapter; // passed from frontend
        
        if (bookId && typeof activeChapter === "number") {
          const chaptersDir = join(cwd, "books", bookId, "chapters");
          const indexPath = join(chaptersDir, "index.json");
          
          if (existsSync(chaptersDir)) {
            try {
              const fs = require("fs");
              // 1. Get physical files on disk
              const files = fs.readdirSync(chaptersDir);
              const fileNums = files
                .map((f: string) => {
                  const match = f.match(/^(\d+)/);
                  return match ? parseInt(match[1], 10) : null;
                })
                .filter((n: number | null): n is number => n !== null)
                .sort((a: number, b: number) => a - b);
              
              const maxPhysicalChapter = fileNums.length > 0 ? Math.max(...fileNums) : 0;
              
              // 2. Read active chapter file content to check if it is a placeholder or empty
              const paddedActive = String(activeChapter).padStart(4, "0");
              const activeFile = files.find((f: string) => f.startsWith(paddedActive) && f.endsWith(".md"));
              
              let isActivePlaceholder = false;
              if (activeFile) {
                const activeContent = fs.readFileSync(join(chaptersDir, activeFile), "utf8");
                const trimmedContent = activeContent.trim();
                if (
                  trimmedContent.length === 0 ||
                  trimmedContent.includes("章节占位") ||
                  trimmedContent.includes("占位草稿") ||
                  trimmedContent.length < 300
                ) {
                  isActivePlaceholder = true;
                }
              }

              // Determine target chapter K we want to write
              let targetChapter: number;
              if (isActivePlaceholder) {
                // If current chapter is a placeholder/empty, we write this chapter (K = activeChapter)
                targetChapter = activeChapter;
              } else {
                // Otherwise, we write the next chapter (K = activeChapter + 1)
                targetChapter = activeChapter + 1;
              }

              const paddedTarget = String(targetChapter).padStart(4, "0");
              const targetFile = files.find((f: string) => f.startsWith(paddedTarget) && f.endsWith(".md"));

              let isTargetReal = false;
              if (targetFile) {
                const targetContent = fs.readFileSync(join(chaptersDir, targetFile), "utf8");
                const trimmedTarget = targetContent.trim();
                if (
                  trimmedTarget.length > 0 &&
                  !trimmedTarget.includes("章节占位") &&
                  !trimmedTarget.includes("占位草稿") &&
                  trimmedTarget.length >= 300
                ) {
                  isTargetReal = true;
                }
              }

              // 3. Find missing physical files that exist in the index (gaps)
              let indexNums: number[] = [];
              if (fs.existsSync(indexPath)) {
                try {
                  const raw = fs.readFileSync(indexPath, "utf8");
                  const parsed = JSON.parse(raw);
                  if (Array.isArray(parsed)) {
                    indexNums = parsed
                      .map((entry: any) => entry?.number)
                      .filter((n: any): n is number => typeof n === "number" && n > 0)
                      .sort((a: number, b: number) => a - b);
                  }
                } catch (e) {
                  // ignore
                }
              }
              const missingNums = indexNums.filter((n: number) => !fileNums.includes(n));

              // 4. Handle target chapter generation
              if (!isTargetReal) {
                // Target chapter K is missing or a placeholder -> Fill in the gap directly!
                console.log(`[write-next auto-healing] Target chapter ${targetChapter} is missing or a placeholder. Filling the gap.`);
                
                if (targetFile) {
                  console.log(`[write-next auto-healing] Deleting placeholder file ${targetFile} to let CLI calculate contiguous progress correctly.`);
                  fs.unlinkSync(join(chaptersDir, targetFile));
                }

                // Clean up index.json: remove targetChapter from the index so the CLI doesn't think it exists
                if (fs.existsSync(indexPath)) {
                  try {
                    const raw = fs.readFileSync(indexPath, "utf8");
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                      const filtered = parsed.filter((entry: any) => entry?.number !== targetChapter);
                      fs.writeFileSync(indexPath, JSON.stringify(filtered, null, 2), "utf8");
                      console.log(`[write-next auto-healing] Removed Chapter ${targetChapter} from index.json to allow rebuilding.`);
                    }
                  } catch (e) {
                    console.error("[write-next auto-healing] Failed to clean up targetChapter from index.json:", e);
                  }
                }

                // If user is editing at the end of their draft (activeChapter >= maxPhysicalChapter)
                // and there are OTHER gaps in the index (before the target chapter), we want to heal those other gaps
                if (activeChapter >= maxPhysicalChapter && missingNums.length > 0) {
                  // Only heal gaps that are strictly less than targetChapter (to avoid healing the targetChapter itself as a blank placeholder)
                  const otherMissingNums = missingNums.filter((n: number) => n < targetChapter);
                  for (const missingNum of otherMissingNums) {
                    const p = String(missingNum).padStart(4, "0");
                    const placeholderPath = join(chaptersDir, `${p}_章节占位.md`);
                    fs.writeFileSync(placeholderPath, `# 第 ${missingNum} 章 占位草稿\n\n（此章节文件曾被手动删除，系统已自动创建占位文件以维持故事连贯性。请在此处重新补充内容。）\n`, "utf8");
                    console.log(`[write-next auto-healing] Created placeholder for Chapter ${missingNum} at ${placeholderPath}`);
                  }
                  localFilesUsed.push(`books/${bookId}/chapters/index.json`);
                }
              } else {
                // Target chapter K exists as a real chapter -> Conflict warning!
                const chaptersToDiscard = fileNums.filter((n: number) => n >= targetChapter);
                if (chaptersToDiscard.length > 0) {
                  if (!args.forceRewrite) {
                    return NextResponse.json({
                      success: false,
                      conflict: true,
                      nextChapterToCreate: targetChapter,
                      chaptersToDiscard,
                      message: `检测到您的书库中已存在后续的第 ${chaptersToDiscard.join(", ")} 章。在第 ${targetChapter - 1} 章后重新续写，将自动覆盖并废弃后续所有章节。`,
                    }, { status: 409 });
                  } else {
                    // Confirmed force rewrite! We run rewrite command synchronously to roll back the state first
                    console.log(`[write-next auto-healing] Confirmed force rewrite. Rolling back state to chapter ${targetChapter - 1}`);
                    try {
                      const rollbackArgs = ["write", "rewrite", bookId, String(targetChapter), "--force"];
                      await runInkos(rollbackArgs, { cwd });
                      console.log(`[write-next auto-healing] Rollback command completed successfully.`);
                    } catch (rollbackErr) {
                      console.error("[write-next auto-healing] Rollback failed:", rollbackErr);
                    }
                  }
                }
              }

              // 5. Restore state to targetChapter - 1 to ensure active story matches correct starting point
              console.log(`[write-next auto-healing] Restoring state to snapshot of chapter ${targetChapter - 1}`);
              await restoreStateHelper(cwd, bookId, targetChapter - 1);
            } catch (err) {
              console.error("[write-next auto-healing] Failed to execute check:", err);
            }
          }
        }
        break;
      }

      case "audit":
        if (!args.chapter) {
          return NextResponse.json({ error: "审计的目标章节文件不能为空" }, { status: 400 });
        }
        cliArgs = ["audit"];
        let auditBookId = args.bookId;
        let auditChapter = args.chapter;
        if (args.chapter.includes("/") || args.chapter.includes("\\")) {
          const parts = args.chapter.replace(/\\/g, "/").split("/");
          if (parts[0] === "books" && parts[1]) {
            auditBookId = parts[1];
          }
          const filename = parts[parts.length - 1];
          const match = filename.match(/^(\d+)/);
          if (match) {
            auditChapter = String(parseInt(match[1], 10));
          }
        }
        if (auditBookId) {
          cliArgs.push(auditBookId);
        }
        cliArgs.push(auditChapter);
        if (args.json) {
          cliArgs.push("--json");
        }
        break;

      case "plan":
        cliArgs = ["plan", "chapter"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        if (args.context) {
          cliArgs.push("--context", args.context);
        }
        break;

      case "compose":
        cliArgs = ["compose", "chapter"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        break;

      case "revise":
        cliArgs = ["revise"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        if (args.chapter) {
          cliArgs.push(String(args.chapter));
        }
        if (args.mode) {
          cliArgs.push("--mode", args.mode);
        }
        if (args.brief) {
          cliArgs.push("--brief", args.brief);
        }
        if (args.json) {
          cliArgs.push("--json");
        }
        break;

      case "write-sync":
        cliArgs = ["write", "sync"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        if (args.chapter) {
          cliArgs.push(String(args.chapter));
        }
        if (args.brief) {
          cliArgs.push("--brief", args.brief);
        }
        if (args.json) {
          cliArgs.push("--json");
        }
        break;


      case "status":
        cliArgs = ["status"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        if (args.json) {
          cliArgs.push("--json");
        }
        break;

      case "doctor":
        cliArgs = ["doctor"];
        break;

      case "custom":
        if (!args.command || !Array.isArray(args.command)) {
          return NextResponse.json({ error: "自定义指令 args.command 必须是字符串数组" }, { status: 400 });
        }
        cliArgs = args.command;
        break;

      default:
        return NextResponse.json({ error: `未知的命令行为: ${action}` }, { status: 400 });
    }

    console.log(`[API/inkos] Spawning streaming local CLI in CWD "${cwd}": node packages/cli/dist/index.js ${cliArgs.join(" ")}`);

    const child = spawnInkos(cliArgs, { cwd });

    const stream = new ReadableStream({
      start(controller) {
        const send = (obj: any) => {
          try {
            controller.enqueue(new TextEncoder().encode(JSON.stringify(obj) + "\n"));
          } catch (e) {
            // controller might be closed
          }
        };

        let stdoutAccumulator = "";
        let stderrAccumulator = "";
        let hasTimedOut = false;

        const timeoutId = setTimeout(() => {
          console.warn("[API/inkos] Process timed out after 600s, killing child.");
          hasTimedOut = true;
          child.kill("SIGTERM");
          send({ type: "stderr", data: "\n⚠️ 任务超时（超过 600 秒），已自动终止。\n" });
        }, 600000);

        child.stdout?.on("data", (chunk) => {
          const text = chunk.toString();
          stdoutAccumulator += text;
          send({ type: "stdout", data: text });
        });

        child.stderr?.on("data", (chunk) => {
          const text = chunk.toString();
          stderrAccumulator += text;
          send({ type: "stderr", data: text });
        });

        child.on("close", (code) => {
          clearTimeout(timeoutId);

          if (tempBriefPath) {
            try {
              const fs = require("fs");
              if (fs.existsSync(tempBriefPath)) {
                fs.unlinkSync(tempBriefPath);
              }
            } catch (e) {
              console.error("[API/inkos] Failed to delete temp brief file:", e);
            }
          }

          send({
            type: "result",
            success: code === 0 && !hasTimedOut,
            error: hasTimedOut ? "任务运行超时（超过 600 秒），已自动终止。" : undefined,
            stdout: stdoutAccumulator,
            stderr: stderrAccumulator,
            code,
            localFilesUsed: localFilesUsed.length > 0 ? localFilesUsed : undefined
          });
          controller.close();
        });

        child.on("error", (err) => {
          clearTimeout(timeoutId);

          if (tempBriefPath) {
            try {
              const fs = require("fs");
              if (fs.existsSync(tempBriefPath)) {
                fs.unlinkSync(tempBriefPath);
              }
            } catch (e) {
              // ignore
            }
          }

          send({
            type: "result",
            success: false,
            error: hasTimedOut ? "任务运行超时（超过 600 秒），已自动终止。" : err.message,
            stdout: stdoutAccumulator,
            stderr: stderrAccumulator,
            localFilesUsed: localFilesUsed.length > 0 ? localFilesUsed : undefined
          });
          controller.close();
        });
      },
      cancel() {
        try {
          child.kill("SIGTERM");
        } catch (e) {
          // ignore
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("[API/inkos] Execution failed:", error);
    return NextResponse.json({
      success: false,
      error: error.message || String(error),
      stdout: error.stdout || "",
      stderr: error.stderr || "",
    }, { status: 500 });
  }
}

async function restoreStateHelper(cwd: string, bookId: string, chapterNumber: number) {
  const fs = require("fs");
  const storyDir = join(cwd, "books", bookId, "story");
  const snapshotDir = join(storyDir, "snapshots", String(chapterNumber));
  
  if (!fs.existsSync(snapshotDir)) {
    console.warn(`[write-next auto-healing] Snapshot directory ${snapshotDir} does not exist. Skipping state restore.`);
    return;
  }
  
  const files = [
    "current_state.md", "particle_ledger.md", "pending_hooks.md",
    "chapter_summaries.md", "subplot_board.md", "emotional_arcs.md", "character_matrix.md",
  ];
  
  const requiredFiles = ["current_state.md", "pending_hooks.md"];
  
  // Restore required files
  for (const f of requiredFiles) {
    const src = join(snapshotDir, f);
    const dest = join(storyDir, f);
    if (fs.existsSync(src)) {
      fs.writeFileSync(dest, fs.readFileSync(src));
      console.log(`[write-next auto-healing] Restored required state file: ${f}`);
    }
  }
  
  // Restore optional files
  for (const f of files.filter(file => !requiredFiles.includes(file))) {
    const src = join(snapshotDir, f);
    const dest = join(storyDir, f);
    if (fs.existsSync(src)) {
      fs.writeFileSync(dest, fs.readFileSync(src));
      console.log(`[write-next auto-healing] Restored optional state file: ${f}`);
    } else {
      if (fs.existsSync(dest)) {
        fs.unlinkSync(dest);
      }
    }
  }
  
  // Restore structured state directory
  const stateDir = join(storyDir, "state");
  const snapshotStateDir = join(snapshotDir, "state");
  
  if (fs.existsSync(snapshotStateDir)) {
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    const stateFiles = fs.readdirSync(snapshotStateDir);
    for (const file of stateFiles) {
      fs.writeFileSync(join(stateDir, file), fs.readFileSync(join(snapshotStateDir, file)));
    }
    console.log(`[write-next auto-healing] Restored structured state files from snapshot.`);
  } else {
    if (fs.existsSync(stateDir)) {
      const stateFiles = fs.readdirSync(stateDir);
      for (const file of stateFiles) {
        fs.unlinkSync(join(stateDir, file));
      }
    }
  }
}

