#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

// 1. Resolve environment variables for model configurations
function resolveModelsEnv(AuthStorage, ModelRegistry, getAgentDir) {
  const envs = {};
  try {
    const agentDir = process.env.PI_CODING_AGENT_DIR || getAgentDir();
    const settingsPath = path.join(agentDir, "settings.json");

    let defaultProvider = "";
    let defaultModel = "";
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        defaultProvider = settings.defaultProvider || "";
        defaultModel = settings.defaultModel || "";
      } catch {}
    }

    const authStorage = AuthStorage.create();
    const registry = ModelRegistry.create(authStorage);

    const allModels = registry.getAll();
    const seenProviders = new Set();

    const PROVIDER_ENV_MAP = {
      "minimax-cn": ["MINIMAX"],
      "xiaomi-token-plan-cn": ["XIAOMIMIMO"],
      "xiaomi-token-plan-ams": ["XIAOMIMIMO"],
      "xiaomi-token-plan-sgp": ["XIAOMIMIMO"],
      "xiaomi": ["XIAOMIMIMO"],
      "moonshotai-cn": ["MOONSHOT"],
      "moonshotai": ["MOONSHOT"],
    };

    for (const model of allModels) {
      if (seenProviders.has(model.provider)) continue;
      seenProviders.add(model.provider);

      const upperProvider = model.provider.toUpperCase().replace(/-/g, "_");
      const auth = authStorage.get(model.provider);
      if (auth && auth.key) {
        envs[`${upperProvider}_API_KEY`] = auth.key;
        if (!envs["OPENAI_API_KEY"]) {
          envs["OPENAI_API_KEY"] = auth.key;
        }
      }

      if (model.baseUrl) {
        envs[`${upperProvider}_BASE_URL`] = model.baseUrl;
        envs[`${upperProvider}_API_URL`] = model.baseUrl;
        if (!envs["OPENAI_BASE_URL"]) {
          envs["OPENAI_BASE_URL"] = model.baseUrl;
        }
      }

      const remapKeys = PROVIDER_ENV_MAP[model.provider] || [];
      for (const k of remapKeys) {
        if (auth && auth.key) {
          envs[`${k}_API_KEY`] = auth.key;
        }
        if (model.baseUrl) {
          envs[`${k}_BASE_URL`] = model.baseUrl;
          envs[`${k}_API_URL`] = model.baseUrl;
        }
      }
    }

    if (defaultProvider && defaultModel) {
      let resolvedProvider = defaultProvider;
      if (defaultProvider.includes("xiaomi-token-plan") || defaultProvider.toLowerCase().includes("mimo")) {
        const actualMimo = allModels.find(m => m.provider.toLowerCase().includes("mimo"))?.provider;
        if (actualMimo) {
          resolvedProvider = actualMimo;
        }
      }

      const activeModel = allModels.find(m => m.provider === resolvedProvider && m.id === defaultModel);
      if (activeModel) {
        const auth = authStorage.get(defaultProvider) || authStorage.get(resolvedProvider);
        if (auth && auth.key) {
          envs["INKOS_LLM_API_KEY"] = auth.key;
        }
        if (activeModel.baseUrl) {
          envs["INKOS_LLM_BASE_URL"] = activeModel.baseUrl;
        }
        envs["INKOS_LLM_MODEL"] = activeModel.id;
        envs["INKOS_LLM_PROVIDER"] = "openai";
        envs["INKOS_LLM_API_FORMAT"] = "chat";
        envs["INKOS_LLM_STREAM"] = "true";
      }
    }
  } catch (e) {
    console.error("[Skill/inkos] Failed to resolve models env:", e);
  }
  return envs;
}



// 2. Parse command line arguments
// Supports: node index.js <action> <json_args_string>
// Or: node index.js <action> --arg1 val1 --arg2 val2 ...
const action = process.argv[2];
let cwd = process.cwd();
let args = {};

if (!action) {
  console.error("Usage: node index.js <action> [options]");
  process.exit(1);
}

// Parse args
for (let i = 3; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--cwd") {
    cwd = process.argv[i + 1];
    i++;
  } else if (arg.startsWith("{") && arg.endsWith("}")) {
    try {
      args = { ...args, ...JSON.parse(arg) };
    } catch (e) {
      console.error("Failed to parse JSON arguments:", e.message);
    }
  } else if (arg.startsWith("--")) {
    const key = arg.slice(2);
    const val = process.argv[i + 1];
    let parsedVal = val;
    if (val === "true") parsedVal = true;
    else if (val === "false") parsedVal = false;
    else if (!isNaN(Number(val))) parsedVal = Number(val);
    args[key] = parsedVal;
    i++;
  }
}

// Helper: resolve bookId dynamically
async function resolveBookId(state, bookIdArg) {
  const books = await state.listBooks();
  if (bookIdArg) {
    if (!books.includes(bookIdArg)) {
      throw new Error(`Book "${bookIdArg}" not found. Available books: ${books.join(", ") || "(none)"}`);
    }
    return bookIdArg;
  }
  if (books.length === 0) {
    throw new Error("No books found. Create one first: inkos book create --title '...'");
  }
  if (books.length === 1) {
    return books[0];
  }
  throw new Error(`Multiple books found: ${books.join(", ")}. Please specify --bookId.`);
}

async function getLegacyMigrationHint(state, bookId) {
  const stateDir = path.join(state.bookDir(bookId), "story", "state");
  try {
    const info = fs.statSync(stateDir);
    if (info.isDirectory()) {
      return null;
    }
  } catch {
    return `Book "${bookId}" uses legacy format. The next write will auto-migrate its state files.`;
  }
  return `Book "${bookId}" uses legacy format. The next write will auto-migrate its state files.`;
}

function parseBookAndChapter(args) {
  let bookId = args.bookId;
  let chapterVal = args.chapter;
  if (typeof chapterVal === "string" && (chapterVal.includes("/") || chapterVal.includes("\\"))) {
    const normalized = chapterVal.replace(/\\/g, "/");
    const parts = normalized.split("/");
    if (parts[0] === "books" && parts[1]) {
      bookId = parts[1];
    }
    const filename = parts[parts.length - 1];
    const match = filename.match(/^(\d+)/);
    if (match) {
      chapterVal = parseInt(match[1], 10);
    }
  }
  const parsedChapter = (typeof chapterVal === "number") ? chapterVal : (chapterVal ? parseInt(chapterVal, 10) : undefined);
  return { bookId, chapterNumber: parsedChapter };
}

// Run mapping
async function main() {
  const needAI = ["write-next", "draft", "plan", "compose", "revise", "short-run", "aigc-detect", "radar-scan"].includes(action);
  const needCore = !["dashboard", "style-list", "style-switch", "get-facts", "add-fact", "update-fact", "delete-fact"].includes(action);

  if (needAI) {
    const { AuthStorage, ModelRegistry, getAgentDir } = await import("@earendil-works/pi-coding-agent");
    const modelsEnv = resolveModelsEnv(AuthStorage, ModelRegistry, getAgentDir);
    Object.assign(process.env, modelsEnv);
  }

  let core;
  let state;
  let service;

  if (needCore) {
    core = await import("@actalk/inkos-core");
    state = new core.StateManager(cwd);

    const onProgress = (progress) => {
      if (progress.stage === "stream") {
        const p = progress.data || {};
        const elapsed = Math.round((p.elapsedMs || 0) / 1000);
        process.stdout.write(`[PROGRESS] {"stage": "stream", "elapsed": ${elapsed}, "chars": ${p.totalChars || 0}, "cjk": ${p.chineseChars || 0}}\n`);
      } else if (progress.stage === "log") {
        const entry = progress.data || {};
        const stageMatches = progress.message.match(/^阶段：(.*)$/) || progress.message.match(/^Stage: (.*)$/);
        if (stageMatches && stageMatches[1]) {
          process.stdout.write(`[PROGRESS] {"stage": "stage_change", "message": "${stageMatches[1].trim()}"}\n`);
        }
        process.stdout.write(`[${(entry.level || "INFO").toUpperCase()}] ${progress.message}\n`);
      } else if (progress.stage === "pipeline_start" || progress.stage === "pipeline_end") {
        process.stdout.write(`[PROGRESS] {"stage": "stage_change", "message": "${progress.message}"}\n`);
      }
    };

    service = new core.InkOSService({
      projectRoot: cwd,
      onProgress,
    });
  }

  let result;
  switch (action) {
    case "init": {
      const projectDir = args.name ? path.join(cwd, args.name) : cwd;
      fs.mkdirSync(projectDir, { recursive: true });
      fs.mkdirSync(path.join(projectDir, "books"), { recursive: true });
      fs.mkdirSync(path.join(projectDir, "radar"), { recursive: true });

      const projectConfig = {
        name: path.basename(projectDir),
        version: "0.1.0",
        language: args.lang || "zh",
        llm: {
          provider: "openai",
          service: "custom",
          configSource: "studio",
          baseUrl: "",
          model: "",
          apiFormat: "chat",
          stream: true,
        },
        notify: [],
        detection: {
          enabled: false,
          provider: "llm",
          threshold: 0.5,
          autoRewrite: false,
        },
        inputGovernanceMode: "v2",
        daemon: {
          schedule: {
            radarCron: "0 */6 * * *",
            writeCron: "*/15 * * * *",
          },
          maxConcurrentBooks: 3,
        },
      };

      fs.writeFileSync(path.join(projectDir, "inkos.json"), JSON.stringify(projectConfig, null, 2), "utf-8");
      fs.writeFileSync(path.join(projectDir, ".env"), "# Local env config\n", "utf-8");
      fs.writeFileSync(path.join(projectDir, ".nvmrc"), "22\n", "utf-8");
      fs.writeFileSync(path.join(projectDir, ".node-version"), "22\n", "utf-8");
      fs.writeFileSync(path.join(projectDir, ".gitignore"), ".env\nnode_modules/\n.DS_Store\n", "utf-8");

      result = { message: `Project initialized at ${projectDir}` };
      break;
    }

    case "book-create": {
      if (!args.title) throw new Error("书籍标题不能为空");
      const bookId = core.deriveBookIdFromTitle(args.title) || `book-${Date.now().toString(36)}`;
      const bookDir = state.bookDir(bookId);

      if (fs.existsSync(bookDir) && (await state.isCompleteBookDirectory(bookDir))) {
        throw new Error(`Book "${bookId}" already exists at books/${bookId}/.`);
      }
      if (fs.existsSync(bookDir)) {
        fs.rmSync(bookDir, { recursive: true, force: true });
      }

      const now = new Date().toISOString();
      const projectConfig = await core.loadProjectConfig(cwd);
      const book = {
        id: bookId,
        title: args.title,
        platform: core.normalizePlatformOrOther(args.platform),
        genre: args.genre || "xuanhuan",
        status: "outlining",
        targetChapters: parseInt(args.targetChapters || "200", 10),
        chapterWordCount: parseInt(args.chapterWords || "3000", 10),
        language: args.lang ?? projectConfig.language,
        createdAt: now,
        updatedAt: now,
      };

      let brief = args.brief || "";
      if (args.selectedFrameworkPath && fs.existsSync(args.selectedFrameworkPath)) {
        try {
          const fwContent = fs.readFileSync(args.selectedFrameworkPath, "utf-8");
          brief += `\n\n【用户已有小说架构 (${path.basename(args.selectedFrameworkPath)})】：\n${fwContent}`;
        } catch (e) {
          console.error("Failed to read selected framework file:", e);
        }
      }
      if (args.selectedCharacterPath && fs.existsSync(args.selectedCharacterPath)) {
        try {
          const charContent = fs.readFileSync(args.selectedCharacterPath, "utf-8");
          brief += `\n\n【用户已有主要人设 (${path.basename(args.selectedCharacterPath)})】：\n${charContent}`;
        } catch (e) {
          console.error("Failed to read selected character file:", e);
        }
      }

      await service.createBook(book, { externalContext: brief });

      result = {
        bookId,
        title: book.title,
        genre: book.genre,
        platform: book.platform,
        location: `books/${bookId}/`,
        nextStep: `inkos write next ${bookId}`,
      };
      break;
    }

    case "fanfic-init": {
      if (!args.title) throw new Error("同人书籍标题不能为空");
      if (!args.from) throw new Error("同人原作素材绝对路径不能为空");
      const mode = args.mode || "canon";
      const sourceText = fs.readFileSync(args.from, "utf-8");
      const sourceName = path.basename(args.from);

      const bookId = core.deriveBookIdFromTitle(args.title) || `book-${Date.now().toString(36)}`;
      const projectConfig = await core.loadProjectConfig(cwd);
      const now = new Date().toISOString();
      const book = {
        id: bookId,
        title: args.title,
        platform: core.normalizePlatformOrOther(args.platform),
        genre: args.genre || "other",
        status: "outlining",
        targetChapters: parseInt(args.targetChapters || "100", 10),
        chapterWordCount: parseInt(args.chapterWords || "3000", 10),
        language: args.lang ?? projectConfig.language,
        createdAt: now,
        updatedAt: now,
        fanficMode: mode,
      };

      await service.createFanficBook(book, sourceText, sourceName, mode);

      result = {
        bookId,
        title: book.title,
        genre: book.genre,
        fanficMode: mode,
        source: sourceName,
        location: `books/${bookId}/`,
      };
      break;
    }

    case "fanfic-refresh": {
      if (!args.from) throw new Error("同人原作素材绝对路径不能为空");
      const bookId = await resolveBookId(state, args.bookId);
      const book = await state.loadBookConfig(bookId);
      const mode = book.fanficMode || "canon";
      const sourceText = fs.readFileSync(args.from, "utf-8");
      const sourceName = path.basename(args.from);

      await service.importFanficCanon(bookId, sourceText, sourceName, mode);

      result = { bookId, source: sourceName, refreshedAt: new Date().toISOString() };
      break;
    }

    case "write-next": {
      const bookId = await resolveBookId(state, args.bookId);
      const wordCount = args.words ? parseInt(args.words, 10) : undefined;
      result = await service.writeNextChapter(bookId, wordCount, args.context);
      break;
    }

    case "draft": {
      const bookId = await resolveBookId(state, args.bookId);
      const wordCount = args.words ? parseInt(args.words, 10) : undefined;
      result = await service.writeDraft(bookId, args.context, wordCount);
      break;
    }

    case "consolidate": {
      const bookId = await resolveBookId(state, args.bookId);
      await service.consolidate(bookId);
      result = { success: true };
      break;
    }

    case "audit": {
      if (!args.chapter) throw new Error("审计的目标章节文件不能为空");
      const { bookId: parsedBookId, chapterNumber } = parseBookAndChapter(args);
      const bookId = await resolveBookId(state, parsedBookId);
      result = await service.auditDraft(bookId, chapterNumber);
      break;
    }

    case "plan": {
      const bookId = await resolveBookId(state, args.bookId);
      result = await service.planChapter(bookId, args.context);
      break;
    }

    case "compose": {
      const bookId = await resolveBookId(state, args.bookId);
      result = await service.composeChapter(bookId, args.context);
      break;
    }

    case "revise": {
      const { bookId: parsedBookId, chapterNumber } = parseBookAndChapter(args);
      const bookId = await resolveBookId(state, parsedBookId);
      const mode = args.mode || "polish";
      result = await service.reviseDraft(bookId, chapterNumber, mode, args.brief);
      break;
    }

    case "write-sync": {
      if (!args.chapter) throw new Error("要同步的章节号不能为空");
      const { bookId: parsedBookId, chapterNumber } = parseBookAndChapter(args);
      const bookId = await resolveBookId(state, parsedBookId);
      result = await service.resyncChapterArtifacts(bookId, chapterNumber);
      break;
    }

    case "status": {
      const allBookIds = await state.listBooks();
      const bookIds = args.bookId ? [args.bookId] : allBookIds;

      const booksData = [];
      for (const id of bookIds) {
        const book = await state.loadBookConfig(id);
        const index = await state.loadChapterIndex(id);
        const migrationHint = await getLegacyMigrationHint(state, id);
        const persistedChapterCount = await state.getPersistedChapterCount(id);
        const { profile: genreProfile } = await core.readGenreProfile(cwd, book.genre);

        const approved = index.filter((ch) => ch.status === "approved").length;
        const pending = index.filter((ch) => ch.status === "ready-for-review").length;
        const failed = index.filter((ch) => ch.status === "audit-failed").length;
        const degraded = index.filter((ch) => ch.status === "state-degraded").length;
        const totalWords = index.reduce((sum, ch) => sum + ch.wordCount, 0);
        const avgWords = index.length > 0 ? Math.round(totalWords / index.length) : 0;

        booksData.push({
          id,
          title: book.title,
          status: book.status,
          genre: book.genre,
          platform: book.platform,
          chapters: persistedChapterCount,
          targetChapters: book.targetChapters,
          totalWords,
          avgWordsPerChapter: avgWords,
          approved,
          pending,
          failed,
          degraded,
          ...(migrationHint ? { migrationHint } : {}),
        });
      }
      result = { project: cwd, books: booksData };
      break;
    }

    case "book-delete": {
      if (!args.bookId) throw new Error("要删除的书籍 ID 不能为空");
      const allBooks = await state.listBooks();
      if (!allBooks.includes(args.bookId)) {
        throw new Error(`Book "${args.bookId}" not found.`);
      }
      const index = await state.loadChapterIndex(args.bookId);
      const bookDir = path.join(cwd, "books", args.bookId);
      fs.rmSync(bookDir, { recursive: true, force: true });
      result = { deleted: args.bookId, chapters: index.length };
      break;
    }

    case "export": {
      const bookId = await resolveBookId(state, args.bookId);
      result = await core.writeExportArtifact(state, bookId, {
        format: args.format || "txt",
        approvedOnly: Boolean(args.approvedOnly),
        outputPath: args.output || path.join(cwd, `${bookId}_export.${args.format || "txt"}`),
      });
      break;
    }

    case "review-approve": {
      if (!args.chapter) throw new Error("审核章节号不能为空");
      const { bookId: parsedBookId, chapterNumber } = parseBookAndChapter(args);
      const bookId = await resolveBookId(state, parsedBookId);
      const index = [...(await state.loadChapterIndex(bookId))];
      const idx = index.findIndex((ch) => ch.number === chapterNumber);
      if (idx === -1) {
        throw new Error(`Chapter ${chapterNumber} not found in "${bookId}"`);
      }
      index[idx] = {
        ...index[idx],
        status: "approved",
        updatedAt: new Date().toISOString(),
      };
      await state.saveChapterIndex(bookId, index);
      result = { bookId, chapter: chapterNumber, status: "approved" };
      break;
    }

    case "review-reject": {
      if (!args.chapter) throw new Error("驳回章节号不能为空");
      const { bookId: parsedBookId, chapterNumber } = parseBookAndChapter(args);
      const bookId = await resolveBookId(state, parsedBookId);
      const index = await state.loadChapterIndex(bookId);
      const idx = index.findIndex((ch) => ch.number === chapterNumber);
      if (idx === -1) {
        throw new Error(`Chapter ${chapterNumber} not found in "${bookId}"`);
      }

      if (args.keepSubsequent) {
        const updated = [...index];
        updated[idx] = {
          ...updated[idx],
          status: "rejected",
          reviewNote: args.reason || "Rejected without reason",
          updatedAt: new Date().toISOString(),
        };
        await state.saveChapterIndex(bookId, updated);
        result = { bookId, chapter: chapterNumber, status: "rejected", discarded: [] };
      } else {
        const rollbackTarget = chapterNumber - 1;
        const discarded = await state.rollbackToChapter(bookId, rollbackTarget);
        result = {
          bookId,
          chapter: chapterNumber,
          status: "rejected",
          rolledBackTo: rollbackTarget,
          discarded,
        };
      }
      break;
    }

    case "import-chapters": {
      if (!args.from) throw new Error("导入源路径不能为空");
      const bookId = await resolveBookId(state, args.bookId);
      const fromPath = path.resolve(cwd, args.from);
      const fromStat = fs.statSync(fromPath);

      let chapters;
      if (fromStat.isDirectory()) {
        const entries = fs.readdirSync(fromPath);
        const textFiles = entries
          .filter((f) => f.endsWith(".md") || f.endsWith(".txt"))
          .sort();

        if (textFiles.length === 0) {
          throw new Error(`No .md or .txt files found in ${fromPath}`);
        }

        chapters = await Promise.all(
          textFiles.map(async (f) => {
            const content = fs.readFileSync(path.join(fromPath, f), "utf-8");
            const title = f.replace(/\.(md|txt)$/, "").replace(/^\d+[_\-\s]*/, "");
            return { title, content };
          })
        );
      } else {
        const text = fs.readFileSync(fromPath, "utf-8");
        chapters = [...core.splitChapters(text, args.split)];
      }

      result = await service.importChapters({
        bookId,
        chapters,
        resumeFrom: args.resumeFrom ? parseInt(args.resumeFrom, 10) : undefined,
        importMode: args.series ? "series" : "continuation",
      });
      break;
    }

    case "import-canon": {
      if (!args.from) throw new Error("原著/前作 Book ID 不能为空");
      const bookId = await resolveBookId(state, args.bookId);
      result = await service.importCanon(bookId, args.from);
      break;
    }

    case "style-import": {
      let fromPath = args.from;
      if (args.content) {
        const tempDir = path.join(cwd, "Temp");
        fs.mkdirSync(tempDir, { recursive: true });
        fromPath = path.join(tempDir, `style_sample_${Date.now()}.txt`);
        fs.writeFileSync(fromPath, args.content, "utf8");
      }

      if (!fromPath) throw new Error("样文文件路径或内容不能为空");

      const bookId = await resolveBookId(state, args.bookId);
      const bookDir = state.bookDir(bookId);

      const text = fs.readFileSync(fromPath, "utf-8");
      const profile = core.analyzeStyle(text, args.name || fromPath);

      const storyDir = path.join(bookDir, "story");
      fs.mkdirSync(storyDir, { recursive: true });
      fs.writeFileSync(
        path.join(storyDir, "style_profile.json"),
        JSON.stringify(profile, null, 2),
        "utf-8"
      );

      if (!args.statsOnly) {
        await service.generateStyleGuide(bookId, text, args.name || fromPath);
      }

      try {
        const activeGuidePath = path.join(storyDir, "style_guide.md");
        const stylesDir = path.join(storyDir, "styles");
        const name = args.name || "default";
        if (fs.existsSync(activeGuidePath)) {
          fs.mkdirSync(stylesDir, { recursive: true });
          const content = fs.readFileSync(activeGuidePath, "utf8");
          fs.writeFileSync(path.join(stylesDir, `${name}.md`), content, "utf8");
        }
      } catch (e) {
        console.error("Failed to copy style guide:", e);
      }

      result = {
        bookId,
        file: fromPath,
        statsProfile: `story/style_profile.json`,
        styleGuide: args.statsOnly ? null : `story/style_guide.md`,
      };
      break;
    }

    case "dashboard": {
      const bookId = args.bookId;
      if (!bookId) throw new Error("书籍ID不能为空");

      const bookDir = path.join(cwd, "books", bookId);
      const indexPath = path.join(bookDir, "chapters", "index.json");

      let chapters = [];
      if (fs.existsSync(indexPath)) {
        chapters = JSON.parse(fs.readFileSync(indexPath, "utf8"));
      }

      const runtimeDir = path.join(bookDir, "story", "runtime");
      const snapshotsDir = path.join(bookDir, "story", "snapshots");

      const dashboardData = chapters.map((ch) => {
        const num = ch.number;
        const padded = String(num).padStart(4, "0");

        const planFile = `chapter-${padded}.plan.md`;
        const intentFile = `chapter-${padded}.intent.md`;

        const hasPlan = fs.existsSync(path.join(runtimeDir, planFile));
        const hasIntent = fs.existsSync(path.join(runtimeDir, intentFile));

        const snapshotPath = path.join(snapshotsDir, String(num));
        const hasSnapshot = fs.existsSync(snapshotPath) && fs.statSync(snapshotPath).isDirectory();

        return {
          ...ch,
          hasPlan,
          hasIntent,
          hasSnapshot,
        };
      });

      const nextChapterNum = dashboardData.length > 0
        ? Math.max(...dashboardData.map((c) => c.number)) + 1
        : 1;
      const nextPadded = String(nextChapterNum).padStart(4, "0");
      const nextHasPlan = fs.existsSync(path.join(runtimeDir, `chapter-${nextPadded}.plan.md`));
      const nextHasIntent = fs.existsSync(path.join(runtimeDir, `chapter-${nextPadded}.intent.md`));

      result = {
        chapters: dashboardData,
        nextChapter: {
          number: nextChapterNum,
          hasPlan: nextHasPlan,
          hasIntent: nextHasIntent,
        },
      };
      break;
    }

    case "style-list": {
      const bookId = args.bookId;
      if (!bookId) throw new Error("书籍ID不能为空");
      const storyDir = path.join(cwd, "books", bookId, "story");
      const stylesDir = path.join(storyDir, "styles");
      const activeGuidePath = path.join(storyDir, "style_guide.md");

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
        const mdFiles = files.filter((f) => f.endsWith(".md"));
        if (mdFiles.length === 0) {
          fs.writeFileSync(path.join(stylesDir, `${activeStyleName}.md`), content, "utf8");
        }
      }

      const files = fs.readdirSync(stylesDir);
      const styles = files
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.substring(0, f.length - 3));

      let currentActive = null;
      if (fs.existsSync(activeGuidePath)) {
        const content = fs.readFileSync(activeGuidePath, "utf8");
        const match = content.match(/>\s*Profile:\s*\*\*([^*]+)\*\*/i);
        currentActive = match ? match[1].trim() : "default";
      }

      result = { styles, activeStyle: currentActive };
      break;
    }

    case "style-switch": {
      const bookId = args.bookId;
      const styleName = args.styleName;
      if (!bookId || !styleName) throw new Error("书籍ID和文风名称不能为空");
      const storyDir = path.join(cwd, "books", bookId, "story");
      const stylesDir = path.join(storyDir, "styles");
      const targetStylePath = path.join(stylesDir, `${styleName}.md`);
      const activeGuidePath = path.join(storyDir, "style_guide.md");

      if (!fs.existsSync(targetStylePath)) {
        throw new Error(`未找到文风配置: ${styleName}`);
      }

      const content = fs.readFileSync(targetStylePath, "utf8");
      fs.writeFileSync(activeGuidePath, content, "utf8");

      result = { success: true, activeStyle: styleName };
      break;
    }

    case "radar-scan": {
      const scanResult = await service.runRadar();

      const radarDir = path.join(cwd, "radar");
      fs.mkdirSync(radarDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filePath = path.join(radarDir, `scan-${timestamp}.json`);
      fs.writeFileSync(filePath, JSON.stringify(scanResult, null, 2), "utf-8");

      result = { ...scanResult, savedTo: filePath };
      break;
    }

    case "aigc-detect": {
      const config = await core.loadProjectConfig(cwd);
      const detectionConfig = { ...config.detection };
      if (args.provider) {
        detectionConfig.provider = args.provider;
        detectionConfig.enabled = true;
      }

      if (!detectionConfig.enabled) {
        throw new Error("AIGC detection is not enabled. Add detection config to inkos.json.");
      }

      const bookId = await resolveBookId(state, args.bookId);
      const bookDir = state.bookDir(bookId);

      if (args.stats) {
        const history = await core.loadDetectionHistory(bookDir);
        result = core.analyzeDetectionInsights(history);
        break;
      }

      const readChapterContent = (bDir, chNum) => {
        const chaptersDir = path.join(bDir, "chapters");
        const files = fs.readdirSync(chaptersDir);
        const paddedNum = String(chNum).padStart(4, "0");
        const chapterFile = files.find((f) => f.startsWith(paddedNum) && f.endsWith(".md"));
        if (!chapterFile) {
          throw new Error("Chapter " + chNum + " file not found");
        }
        const raw = fs.readFileSync(path.join(chaptersDir, chapterFile), "utf-8");
        const lines = raw.split("\n");
        const contentStart = lines.findIndex((l, i) => i > 0 && l.trim().length > 0);
        return contentStart >= 0 ? lines.slice(contentStart).join("\n") : raw;
      };

      if (args.all) {
        const index = await state.loadChapterIndex(bookId);
        const results = [];
        for (const ch of index) {
          const content = readChapterContent(bookDir, ch.number);
          const r = await service.detectChapter(detectionConfig, content, ch.number);
          results.push(r);
        }
        result = { results };
      } else {
        const { chapterNumber } = parseBookAndChapter(args);
        const targetChapter = chapterNumber || (await state.getNextChapterNumber(bookId)) - 1;
        if (targetChapter < 1) throw new Error("No chapters to detect.");
        const content = readChapterContent(bookDir, targetChapter);
        result = await service.detectChapter(detectionConfig, content, targetChapter);
      }
      break;
    }

    case "short-run": {
      if (!args.direction) throw new Error("短篇小说创作方向 (direction) 不能为空");
      const chapterCount = args.chapters ? parseInt(args.chapters, 10) : core.SHORT_FICTION_DEFAULT_CHAPTERS;
      const charsPerChapter = args.chars ? parseInt(args.chars, 10) : core.SHORT_FICTION_DEFAULT_CHARS_PER_CHAPTER;

      const resolveRuntime = async (mName) => {
        const config = await core.loadProjectConfig(cwd);
        if (mName) config.llm.model = mName;

        const client = core.createLLMClient(config.llm);
        const sinks = [{ write(e) { process.stdout.write(`[SHORT] ${e.message}\n`); } }];
        const logger = core.createLogger({ tag: "inkos", sinks });
        return { client, model: config.llm.model, logger };
      };

      const plannerRuntime = await resolveRuntime(args.plannerModel || args.model);
      const outlineReviewRuntime = await resolveRuntime(args.outlineReviewModel || args.model);
      const writerRuntime = await resolveRuntime(args.writerModel || args.model);
      const draftReviewRuntime = await resolveRuntime(args.draftReviewModel || args.model);
      const reviseRuntime = await resolveRuntime(args.reviseModel || args.model);
      const packageRuntime = await resolveRuntime(args.packageModel || args.model);

      result = await core.runShortFictionProduction({
        projectRoot: cwd,
        direction: args.direction,
        runtimes: {
          planner: { ...plannerRuntime, projectRoot: cwd },
          outlineReview: { ...outlineReviewRuntime, projectRoot: cwd },
          writer: { ...writerRuntime, projectRoot: cwd },
          draftReview: { ...draftReviewRuntime, projectRoot: cwd },
          revise: { ...reviseRuntime, projectRoot: cwd },
          package: { ...packageRuntime, projectRoot: cwd },
        },
        storyId: args.storyId,
        outDir: args.outDir || "shorts",
        chapterCount,
        charsPerChapter,
        stage: args.stage || "all",
        cover: args.cover,
        coverBaseUrl: args.coverBaseUrl,
        coverEndpoint: args.coverEndpoint,
        coverModel: args.coverModel,
        coverSize: args.coverSize,
        coverApiKeyEnv: args.coverApiKeyEnv,
        onProgress: (msg) => {
          process.stdout.write(`[PROGRESS] ${msg}\n`);
        },
      });
      break;
    }

    case "get-facts": {
      const bookId = args.bookId;
      if (!bookId) throw new Error("书籍ID不能为空");
      const dbPath = path.join(cwd, "books", bookId, "story", "memory.db");
      if (!fs.existsSync(dbPath)) {
        result = { success: true, facts: [] };
        break;
      }
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(dbPath);
      let rows;
      if (typeof args.chapter === "number") {
        const ch = args.chapter;
        rows = db.prepare("SELECT id, subject, predicate, object, valid_from_chapter AS validFromChapter, valid_until_chapter AS validUntilChapter, source_chapter AS sourceChapter FROM facts WHERE valid_from_chapter <= ? AND (valid_until_chapter IS NULL OR valid_until_chapter > ?)")
          .all(ch, ch);
      } else {
        rows = db.prepare("SELECT id, subject, predicate, object, valid_from_chapter AS validFromChapter, valid_until_chapter AS validUntilChapter, source_chapter AS sourceChapter FROM facts")
          .all();
      }
      db.close();
      result = { success: true, facts: rows };
      break;
    }

    case "update-fact": {
      const bookId = args.bookId;
      const factId = args.id;
      if (!bookId || !factId) throw new Error("书籍ID和事实ID不能为空");
      const dbPath = path.join(cwd, "books", bookId, "story", "memory.db");
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(dbPath);
      db.prepare("UPDATE facts SET valid_from_chapter = ?, valid_until_chapter = ?, object = ?, predicate = ?, subject = ? WHERE id = ?").run(
        args.validFromChapter,
        args.validUntilChapter === null ? null : args.validUntilChapter,
        args.object,
        args.predicate,
        args.subject,
        factId
      );
      db.close();
      result = { success: true };
      break;
    }

    case "add-fact": {
      const bookId = args.bookId;
      if (!bookId) throw new Error("书籍ID不能为空");
      const dbPath = path.join(cwd, "books", bookId, "story", "memory.db");
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(dbPath);
      db.prepare("INSERT INTO facts (subject, predicate, object, valid_from_chapter, valid_until_chapter, source_chapter) VALUES (?, ?, ?, ?, ?, ?)").run(
        args.subject,
        args.predicate,
        args.object,
        args.validFromChapter,
        args.validUntilChapter === null ? null : args.validUntilChapter,
        -1
      );
      db.close();
      result = { success: true };
      break;
    }

    case "delete-fact": {
      const bookId = args.bookId;
      const factId = args.id;
      if (!bookId || !factId) throw new Error("书籍ID和事实ID不能为空");
      const dbPath = path.join(cwd, "books", bookId, "story", "memory.db");
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(dbPath);
      db.prepare("DELETE FROM facts WHERE id = ?").run(factId);
      db.close();
      result = { success: true };
      break;
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }

  // Print final JSON result block
  console.log("\n--- RESULT ---");
  console.log(JSON.stringify({ success: true, ...result }, null, 2));
}

main().catch((err) => {
  console.log("\n--- RESULT ---");
  process.stdout.write(
    JSON.stringify({ success: false, error: err.message || String(err) }, null, 2) + "\n",
    () => {
      process.exit(1);
    }
  );
});
