import { NextRequest, NextResponse } from "next/server";
import { runInkos } from "@/lib/npx";
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
        if (args.brief) {
          cliArgs.push("--brief", args.brief);
        }
        if (args.chapterWords) {
          cliArgs.push("--chapter-words", String(args.chapterWords));
        }
        break;

      case "write-next":
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
        break;

      case "audit":
        if (!args.chapter) {
          return NextResponse.json({ error: "审计的目标章节文件不能为空" }, { status: 400 });
        }
        cliArgs = ["audit"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
        }
        cliArgs.push(args.chapter);
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

      case "status":
        cliArgs = ["status"];
        if (args.bookId) {
          cliArgs.push(args.bookId);
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

    console.log(`[API/inkos] Spawning local CLI in CWD "${cwd}": node packages/cli/dist/index.js ${cliArgs.join(" ")}`);
    
    // Execute command with a reasonable 90-second timeout for long running generation/audits
    const result = await runInkos(cliArgs, {
      cwd,
      timeout: 90000, 
    });

    return NextResponse.json({
      success: true,
      stdout: result.stdout,
      stderr: result.stderr,
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
