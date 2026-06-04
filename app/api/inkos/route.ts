import "@/lib/env-init";
import { NextRequest, NextResponse } from "next/server";
import { runInkos, spawnInkos } from "@/lib/npx";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { action, cwd, args = {} } = await request.json();

    if (!cwd) {
      return NextResponse.json({ error: "创作工作区目录 (cwd) 不能为空" }, { status: 400 });
    }

    // Verify cwd exists before running commands (allow init action to auto-create it)
    if (!existsSync(cwd)) {
      if (action === "init") {
        try {
          mkdirSync(cwd, { recursive: true });
        } catch (mkdirErr: any) {
          return NextResponse.json({ error: `无法创建创作工作区目录: ${mkdirErr.message || mkdirErr}` }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: `创作工作区目录不存在: ${cwd}` }, { status: 400 });
      }
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

      case "fanfic-init": {
        if (!args.title) {
          return NextResponse.json({ error: "同人书籍标题不能为空" }, { status: 400 });
        }
        if (!args.from) {
          return NextResponse.json({ error: "同人原作素材绝对路径不能为空" }, { status: 400 });
        }
        cliArgs = ["fanfic", "init", "--title", args.title, "--from", args.from];
        if (args.mode) {
          cliArgs.push("--mode", args.mode);
        }
        if (args.genre) {
          cliArgs.push("--genre", args.genre);
        }
        if (args.platform) {
          cliArgs.push("--platform", args.platform);
        }
        if (args.targetChapters) {
          cliArgs.push("--target-chapters", String(args.targetChapters));
        }
        if (args.chapterWords) {
          cliArgs.push("--chapter-words", String(args.chapterWords));
        }
        if (args.json) {
          cliArgs.push("--json");
        }
        break;
      }

      case "fanfic-refresh": {
        if (!args.from) {
          return NextResponse.json({ error: "同人原作素材绝对路径不能为空" }, { status: 400 });
        }
        cliArgs = ["fanfic", "refresh"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        cliArgs.push("--from", args.from);
        if (args.json) {
          cliArgs.push("--json");
        }
        break;
      }

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

      case "draft": {
        cliArgs = ["draft"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        if (args.words) {
          cliArgs.push("--words", String(args.words));
        }
        if (args.context) {
          cliArgs.push("--context", args.context);
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
                console.log(`[draft auto-healing] Target chapter ${targetChapter} is missing or a placeholder. Filling the gap.`);
                
                if (targetFile) {
                  console.log(`[draft auto-healing] Deleting placeholder file ${targetFile} to let CLI calculate contiguous progress correctly.`);
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
                      console.log(`[draft auto-healing] Removed Chapter ${targetChapter} from index.json to allow rebuilding.`);
                    }
                  } catch (e) {
                    console.error("[draft auto-healing] Failed to clean up targetChapter from index.json:", e);
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
                    console.log(`[draft auto-healing] Created placeholder for Chapter ${missingNum} at ${placeholderPath}`);
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
                      message: `检测到您的书库中已存在后续的第 ${chaptersToDiscard.join(", ")} 章。在第 ${targetChapter - 1} 章后重新起草，将自动覆盖并废弃后续所有章节。`,
                    }, { status: 409 });
                  } else {
                    // Confirmed force rewrite! We run rewrite command synchronously to roll back the state first
                    console.log(`[draft auto-healing] Confirmed force rewrite. Rolling back state to chapter ${targetChapter - 1}`);
                    try {
                      const rollbackArgs = ["write", "rewrite", bookId, String(targetChapter), "--force"];
                      await runInkos(rollbackArgs, { cwd });
                      console.log(`[draft auto-healing] Rollback command completed successfully.`);
                    } catch (rollbackErr) {
                      console.error("[draft auto-healing] Rollback failed:", rollbackErr);
                    }
                  }
                }
              }

              // 5. Restore state to targetChapter - 1 to ensure active story matches correct starting point
              console.log(`[draft auto-healing] Restoring state to snapshot of chapter ${targetChapter - 1}`);
              await restoreStateHelper(cwd, bookId, targetChapter - 1);
            } catch (err) {
              console.error("[draft auto-healing] Failed to execute check:", err);
            }
          }
        }
        break;
      }

      case "consolidate":
        cliArgs = ["consolidate"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        if (args.json) {
          cliArgs.push("--json");
        }
        break;

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

      case "book-delete":
        if (!args.bookId) {
          return NextResponse.json({ error: "要删除的书籍 ID 不能为空" }, { status: 400 });
        }
        cliArgs = ["book", "delete", args.bookId, "--force"];
        if (args.json) {
          cliArgs.push("--json");
        }
        break;

      case "export":
        cliArgs = ["export"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        if (args.format) {
          cliArgs.push("--format", args.format);
        }
        if (args.approvedOnly) {
          cliArgs.push("--approved-only");
        }
        if (args.output) {
          cliArgs.push("--output", args.output);
        }
        if (args.json) {
          cliArgs.push("--json");
        }
        break;

      case "review-approve":
        if (!args.chapter) {
          return NextResponse.json({ error: "审核章节号不能为空" }, { status: 400 });
        }
        cliArgs = ["review", "approve"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        cliArgs.push(String(args.chapter));
        if (args.json) {
          cliArgs.push("--json");
        }
        break;

      case "review-reject":
        if (!args.chapter) {
          return NextResponse.json({ error: "驳回章节号不能为空" }, { status: 400 });
        }
        cliArgs = ["review", "reject"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        cliArgs.push(String(args.chapter));
        if (args.reason) {
          cliArgs.push("--reason", args.reason);
        }
        if (args.keepSubsequent) {
          cliArgs.push("--keep-subsequent");
        }
        if (args.json) {
          cliArgs.push("--json");
        }
        break;

      case "import-chapters":
        if (!args.from) {
          return NextResponse.json({ error: "导入源路径不能为空" }, { status: 400 });
        }
        cliArgs = ["import", "chapters"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        cliArgs.push("--from", args.from);
        if (args.split) {
          cliArgs.push("--split", args.split);
        }
        if (args.resumeFrom) {
          cliArgs.push("--resume-from", String(args.resumeFrom));
        }
        if (args.series) {
          cliArgs.push("--series");
        }
        if (args.json) {
          cliArgs.push("--json");
        }
        break;

      case "import-canon":
        if (!args.from) {
          return NextResponse.json({ error: "原著/前作 Book ID 不能为空" }, { status: 400 });
        }
        cliArgs = ["import", "canon"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        cliArgs.push("--from", args.from);
        if (args.json) {
          cliArgs.push("--json");
        }
        break;

      case "style-import": {
        let fromPath = args.from;
        if (args.content) {
          try {
            const fs = require("fs");
            const tempDir = join(cwd, "Temp");
            if (!fs.existsSync(tempDir)) {
              fs.mkdirSync(tempDir, { recursive: true });
            }
            fromPath = join(tempDir, `style_sample_${Date.now()}.txt`);
            fs.writeFileSync(fromPath, args.content, "utf8");
            tempBriefPath = fromPath; // Clean up temp file on process exit/error
          } catch (e: any) {
            return NextResponse.json({ error: `无法创建临时样文本文件: ${e.message || e}` }, { status: 500 });
          }
        }

        if (!fromPath) {
          return NextResponse.json({ error: "样文文件路径或内容不能为空" }, { status: 400 });
        }

        cliArgs = ["style", "import", fromPath];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        if (args.name) {
          cliArgs.push("--name", args.name);
        }
        if (args.statsOnly) {
          cliArgs.push("--stats-only");
        }
        if (args.json) {
          cliArgs.push("--json");
        }
        break;
      }

      case "dashboard": {
        const fs = require("fs");
        const bookId = args.bookId;
        if (!bookId) {
          return NextResponse.json({ error: "书籍ID不能为空" }, { status: 400 });
        }
        
        const bookDir = join(cwd, "books", bookId);
        const indexPath = join(bookDir, "chapters", "index.json");
        
        let chapters = [];
        if (fs.existsSync(indexPath)) {
          try {
            const raw = fs.readFileSync(indexPath, "utf8");
            chapters = JSON.parse(raw);
          } catch (e: any) {
            return NextResponse.json({ error: `无法读取章节索引: ${e.message}` }, { status: 500 });
          }
        }
        
        if (!Array.isArray(chapters)) {
          chapters = [];
        }

        const runtimeDir = join(bookDir, "story", "runtime");
        const snapshotsDir = join(bookDir, "story", "snapshots");

        const dashboardData = chapters.map((ch: any) => {
          const num = ch.number;
          const padded = String(num).padStart(4, "0");
          
          const planFile = `chapter-${padded}.plan.md`;
          const intentFile = `chapter-${padded}.intent.md`;
          
          const hasPlan = fs.existsSync(join(runtimeDir, planFile));
          const hasIntent = fs.existsSync(join(runtimeDir, intentFile));
          
          const snapshotPath = join(snapshotsDir, String(num));
          const hasSnapshot = fs.existsSync(snapshotPath) && fs.statSync(snapshotPath).isDirectory();

          return {
            ...ch,
            hasPlan,
            hasIntent,
            hasSnapshot,
          };
        });

        const nextChapterNum = dashboardData.length > 0 
          ? Math.max(...dashboardData.map((c: any) => c.number)) + 1 
          : 1;
        const nextPadded = String(nextChapterNum).padStart(4, "0");
        const nextHasPlan = fs.existsSync(join(runtimeDir, `chapter-${nextPadded}.plan.md`));
        const nextHasIntent = fs.existsSync(join(runtimeDir, `chapter-${nextPadded}.intent.md`));

        return NextResponse.json({ 
          success: true, 
          chapters: dashboardData,
          nextChapter: {
            number: nextChapterNum,
            hasPlan: nextHasPlan,
            hasIntent: nextHasIntent
          }
        });
      }

      case "style-list": {
        const fs = require("fs");
        const bookId = args.bookId;
        if (!bookId) {
          return NextResponse.json({ error: "书籍ID不能为空" }, { status: 400 });
        }
        const storyDir = join(cwd, "books", bookId, "story");
        const stylesDir = join(storyDir, "styles");
        const activeGuidePath = join(storyDir, "style_guide.md");

        if (!fs.existsSync(stylesDir)) {
          fs.mkdirSync(stylesDir, { recursive: true });
        }

        let activeStyleName = "default";
        if (fs.existsSync(activeGuidePath)) {
          const content = fs.readFileSync(activeGuidePath, "utf8");
          const match = content.match(/>\s*Profile:\s*\*\*([^*]+)\*\*/i);
          if (match) {
            activeStyleName = match[1].trim();
          }
          const files = fs.readdirSync(stylesDir);
          const mdFiles = files.filter((f: string) => f.endsWith(".md"));
          if (mdFiles.length === 0) {
            fs.writeFileSync(join(stylesDir, `${activeStyleName}.md`), content, "utf8");
          }
        }

        const files = fs.readdirSync(stylesDir);
        const styles = files
          .filter((f: string) => f.endsWith(".md"))
          .map((f: string) => f.substring(0, f.length - 3));

        let currentActive: string | null = null;
        if (fs.existsSync(activeGuidePath)) {
          const content = fs.readFileSync(activeGuidePath, "utf8");
          const match = content.match(/>\s*Profile:\s*\*\*([^*]+)\*\*/i);
          if (match) {
            currentActive = match[1].trim();
          } else {
            currentActive = "default";
          }
        }

        return NextResponse.json({ styles, activeStyle: currentActive });
      }

      case "style-switch": {
        const fs = require("fs");
        const bookId = args.bookId;
        const styleName = args.styleName;
        if (!bookId || !styleName) {
          return NextResponse.json({ error: "书籍ID和文风名称不能为空" }, { status: 400 });
        }
        const storyDir = join(cwd, "books", bookId, "story");
        const stylesDir = join(storyDir, "styles");
        const targetStylePath = join(stylesDir, `${styleName}.md`);
        const activeGuidePath = join(storyDir, "style_guide.md");

        if (!fs.existsSync(targetStylePath)) {
          return NextResponse.json({ error: `未找到文风配置: ${styleName}` }, { status: 404 });
        }

        const content = fs.readFileSync(targetStylePath, "utf8");
        fs.writeFileSync(activeGuidePath, content, "utf8");

        return NextResponse.json({ success: true, activeStyle: styleName });
      }

      case "radar-scan":
        cliArgs = ["radar", "scan"];
        if (args.json) {
          cliArgs.push("--json");
        }
        break;

      case "aigc-detect":
        cliArgs = ["detect"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        if (args.chapter) {
          cliArgs.push(String(args.chapter));
        }
        if (args.all) {
          cliArgs.push("--all");
        }
        if (args.stats) {
          cliArgs.push("--stats");
        }
        if (args.provider) {
          cliArgs.push("--provider", args.provider);
        }
        if (args.json) {
          cliArgs.push("--json");
        }
        break;

      case "short-run":
        if (!args.direction) {
          return NextResponse.json({ error: "短篇小说创作方向 (direction) 不能为空" }, { status: 400 });
        }
        cliArgs = ["short", "run", "--direction", args.direction];
        if (args.chapters) {
          cliArgs.push("--chapters", String(args.chapters));
        }
        if (args.chars) {
          cliArgs.push("--chars", String(args.chars));
        }
        if (args.stage) {
          cliArgs.push("--stage", args.stage);
        }
        if (args.storyId) {
          cliArgs.push("--story-id", args.storyId);
        }
        if (args.noCover) {
          cliArgs.push("--no-cover");
        }
        if (args.model) {
          cliArgs.push("--model", args.model);
        }
        if (args.json) {
          cliArgs.push("--json");
        }
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
          console.warn("[API/inkos] Process timed out after 1800s, killing child.");
          hasTimedOut = true;
          child.kill("SIGTERM");
          send({ type: "stderr", data: "\n⚠️ 任务超时（超过 1800 秒），已自动终止。\n" });
        }, 1800000);

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

          if (code === 0 && !hasTimedOut && action === "style-import") {
            try {
              const fs = require("fs");
              const bookId = args.bookId;
              const name = args.name || "default";
              if (bookId) {
                const storyDir = join(cwd, "books", bookId, "story");
                const activeGuidePath = join(storyDir, "style_guide.md");
                const stylesDir = join(storyDir, "styles");
                if (fs.existsSync(activeGuidePath)) {
                  if (!fs.existsSync(stylesDir)) {
                    fs.mkdirSync(stylesDir, { recursive: true });
                  }
                  const content = fs.readFileSync(activeGuidePath, "utf8");
                  fs.writeFileSync(join(stylesDir, `${name}.md`), content, "utf8");
                  console.log(`[API/inkos] Successfully copied newly imported style to styles/${name}.md`);
                }
              }
            } catch (e: any) {
              console.error("[API/inkos] Failed to copy style guide to styles dir after import:", e);
            }
          }

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
            error: hasTimedOut
              ? "任务运行超时（超过 1800 秒），已自动终止。"
              : (code !== 0 ? (stderrAccumulator.trim() || `任务执行失败，退出码: ${code}`) : undefined),
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
            error: hasTimedOut ? "任务运行超时（超过 1800 秒），已自动终止。" : err.message,
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

