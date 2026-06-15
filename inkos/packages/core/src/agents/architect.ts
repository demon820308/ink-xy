import { BaseAgent } from "./base.js";
import type { BookConfig, FanficMode } from "../models/book.js";
import type { GenreProfile } from "../models/genre-profile.js";
import { readGenreProfile } from "./rules-reader.js";
import { PromptLoader } from "../prompts/prompt-loader.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { renderHookSnapshot } from "../utils/memory-retrieval.js";
import {
  shouldPromoteHook,
  type PromotionContext,
  type VolumeBoundary,
} from "../utils/hook-promotion.js";
import type { StoredHook } from "../state/memory-db.js";

// ---------------------------------------------------------------------------
// Phase 5 (v13) — Static 骨架 layer collapse
// Phase 5 consolidation — 7 sections → 5 sections (output shrinks ~25–40%).
//
// Architect now produces 2 prose outline files + one-file-per-character roles/
// folder, plus compat pointer shims. The LLM output contract is 5 blocks:
//
//   === SECTION: story_frame ===   4 散文段（主题 / 冲突 / 世界铁律+质感 / 终局）
//   === SECTION: volume_map ===    5 散文段 + 尾段「6 条节奏原则（具体化 + 通用）」
//   === SECTION: roles ===         一人一卡；主角卡承载完整弧线（起点→终点→代价）
//   === SECTION: book_rules ===    仅 YAML frontmatter，零散文
//   === SECTION: pending_hooks ===  13-column 表；可含 startChapter=0 种子行
//
// Consolidation rules (MUST reflect in prompt):
//   - 主角弧线只写在 roles/<主角>.md，不在 story_frame 重复
//   - 世界铁律/世界质感只写在 story_frame.世界观底色，不在 book_rules 重复
//   - 节奏原则只写在 volume_map 尾段，不作为独立 section
//     （至少 3 条具体化，其余可为通用原则）
//   - 初始状态拆分：角色当前现状 → roles.当前现状；初始钩子 → pending_hooks (startChapter=0)；
//     环境/时代锚（仅历史/年代题材需要）→ 自然融入 story_frame.世界观底色
//   - 独立的 current_state section 已删除。现状只在运行时写入 current_state.md
//     （consolidator 每章追加），建书时架构师不产出结构化初始态。
//
// Budget table (4 content items — LLM sections):
//   story_frame ≤ 3000 chars / volume_map ≤ 5000 chars / roles 总 ≤ 8000 chars
//   book_rules ≤ 500 chars (YAML only) / pending_hooks ≤ 2000 chars
//
// 输出落盘 contract（未变）：
//   outline/story_frame.md      ← 4 prose sections + YAML frontmatter
//   outline/volume_map.md       ← 5 prose sections + 节奏原则尾段
//   roles/主要角色/<name>.md    ← one file per major character
//   roles/次要角色/<name>.md    ← one file per minor character
//   story_bible.md              ← compat shim
//   character_matrix.md         ← compat shim
//   book_rules.md               ← compat shim
//   current_state.md            ← seed 占位文件（运行时 consolidator 每章追加）
//   pending_hooks.md            ← 架构师初始伏笔池
//   emotional_arcs.md           ← runtime state
//
// 「散文密度」= 架构师 LLM 的输出密度。所有 prose 都写死在架构师 prompt 里，
// 不从模板复制。v6 灵气的起点在这里。
// ---------------------------------------------------------------------------

export interface ArchitectRole {
  readonly tier: "major" | "minor";
  readonly name: string;
  readonly content: string;
}

/**
 * Split a markdown string into its leading YAML frontmatter block and the
 * remaining body. Returns `frontmatter: null` when no frontmatter is present.
 * Only recognises a frontmatter block that starts on the FIRST non-empty
 * line — embedded `---` sections in prose are left alone.
 */
function extractYamlFrontmatter(raw: string): { frontmatter: string | null; body: string } {
  if (!raw) return { frontmatter: null, body: "" };
  const stripped = raw.replace(/^```(?:md|markdown|yaml)?\s*\n/, "").replace(/\n```\s*$/, "");
  const leadingMatch = stripped.match(/^\s*---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!leadingMatch) {
    return { frontmatter: null, body: stripped };
  }
  return {
    frontmatter: `---\n${leadingMatch[1]}\n---`,
    body: leadingMatch[2].trim(),
  };
}

export interface ArchitectOutput {
  // Legacy shape — kept for back-compat with consumers that still read the
  // old file names. Filled from the new prose sections below when Phase 5
  // architect runs; external callers see the same surface.
  readonly storyBible: string;
  readonly volumeOutline: string;
  readonly bookRules: string;
  readonly currentState: string;
  readonly pendingHooks: string;
  // Phase 5 new shape. Optional in the type surface so legacy test fixtures
  // that mock only the old fields continue to compile — the architect itself
  // always fills these at runtime.
  readonly storyFrame?: string;
  readonly volumeMap?: string;
  readonly rhythmPrinciples?: string;
  readonly roles?: ReadonlyArray<ArchitectRole>;
}

export class ArchitectAgent extends BaseAgent {
  get name(): string {
    return "architect";
  }

  async generateFoundation(
    book: BookConfig,
    externalContext?: string,
    reviewFeedback?: string,
    options?: {
      reviseFrom?: {
        storyBible: string;
        volumeOutline: string;
        bookRules: string;
        characterMatrix: string;
        userFeedback: string;
      };
    },
  ): Promise<ArchitectOutput> {
    const { profile: gp, body: genreBody } =
      await readGenreProfile(this.ctx.projectRoot, book.genre);
    const resolvedLanguage = book.language ?? gp.language;

    const contextBlock = externalContext
      ? `\n\n## 外部指令\n以下是来自外部系统的创作指令，请将其融入设定中：\n\n${externalContext}\n`
      : "";
    const reviewFeedbackBlock = this.buildReviewFeedbackBlock(reviewFeedback, resolvedLanguage);
    const revisePrompt = options?.reviseFrom
      ? this.buildRevisePrompt(options.reviseFrom, resolvedLanguage === "en")
      : "";

    const numericalBlock = gp.numericalSystem
      ? "- 有明确的数值/资源体系可追踪\n- 在 book_rules 中定义 numericalSystemOverrides（hardCap、resourceTypes）"
      : "- 本题材无数值系统，不需要资源账本";
    const powerBlock = gp.powerScaling ? "- 有明确的战力等级体系" : "";
    const eraBlock = gp.eraResearch ? "- 需要年代考据支撑（在 book_rules 中设置 eraConstraints）" : "";

    const systemPrompt = resolvedLanguage === "en"
      ? this.buildEnglishFoundationPrompt(book, gp, genreBody, contextBlock, reviewFeedbackBlock, numericalBlock, powerBlock, eraBlock)
      : this.buildChineseFoundationPrompt(book, gp, genreBody, contextBlock, reviewFeedbackBlock, numericalBlock, powerBlock, eraBlock);

    const langPrefix = resolvedLanguage === "en"
      ? `【LANGUAGE OVERRIDE】ALL output (story_frame, volume_map, roles, book_rules, pending_hooks) MUST be written in English. Character names, place names, and all prose must be in English. The === SECTION: === tags remain unchanged. Do NOT emit rhythm_principles or current_state sections — rhythm principles live inside the last paragraph of volume_map; environment/era anchors (when relevant) are woven into story_frame's world-tonal-ground paragraph.\n\n`
      : "";
    const userMessage = resolvedLanguage === "en"
      ? `Generate the complete foundation for a ${gp.name} novel titled "${book.title}". Write everything in English.`
      : `请为标题为"${book.title}"的${gp.name}小说生成完整基础设定。`;

    const response = await this.chat([
      { role: "system", content: langPrefix + systemPrompt + revisePrompt },
      { role: "user", content: userMessage },
    ], { temperature: 0.8 });

    return this.parseSections(response.content, resolvedLanguage);
  }

  private buildRevisePrompt(
    reviseFrom: {
      storyBible: string;
      volumeOutline: string;
      bookRules: string;
      characterMatrix: string;
      userFeedback: string;
    },
    isEnglish: boolean,
  ): string {
    const filename = isEnglish ? "architect_revise_system_en.md" : "architect_revise_system_zh.md";
    const loadedTemplate = PromptLoader.loadRequiredPrompt(filename);
    return "\n\n" + loadedTemplate
      .replace("{{storyBible}}", reviseFrom.storyBible || (isEnglish ? "(none)" : "（无）"))
      .replace("{{volumeOutline}}", reviseFrom.volumeOutline || (isEnglish ? "(none)" : "（无）"))
      .replace("{{bookRules}}", reviseFrom.bookRules || (isEnglish ? "(none)" : "（无）"))
      .replace("{{characterMatrix}}", reviseFrom.characterMatrix || (isEnglish ? "(none)" : "（无）"))
      .replace("{{userFeedback}}", reviseFrom.userFeedback || (isEnglish ? "(none)" : "（无）"));
  }

  // -------------------------------------------------------------------------
  // Prose prompt — zh (primary)
  // -------------------------------------------------------------------------
  private buildChineseFoundationPrompt(
    book: BookConfig,
    gp: GenreProfile,
    genreBody: string,
    contextBlock: string,
    reviewFeedbackBlock: string,
    numericalBlock: string,
    powerBlock: string,
    eraBlock: string,
  ): string {
    const numericalSystemOverrides = gp.numericalSystem
      ? `numericalSystemOverrides:\n  hardCap: (根据设定确定)\n  resourceTypes: [(核心资源类型列表)]`
      : "";

    const loadedTemplate = PromptLoader.loadRequiredPrompt("architect_system_zh.md");
    return loadedTemplate
      .replace("{{platform}}", book.platform)
      .replace("{{genre}}", gp.name)
      .replace("{{genreId}}", book.genre)
      .replace("{{targetChapters}}", String(book.targetChapters))
      .replace("{{chapterWordCount}}", String(book.chapterWordCount))
      .replace("{{title}}", book.title)
      .replace("{{genreBody}}", genreBody)
      .replace("{{numericalBlock}}", numericalBlock)
      .replace("{{powerBlock}}", powerBlock)
      .replace("{{eraBlock}}", eraBlock)
      .replace("{{contextBlock}}", contextBlock)
      .replace("{{reviewFeedbackBlock}}", reviewFeedbackBlock)
      .replace("{{numericalSystemOverrides}}", numericalSystemOverrides);
  }

  private buildEnglishFoundationPrompt(
    book: BookConfig,
    gp: GenreProfile,
    genreBody: string,
    contextBlock: string,
    reviewFeedbackBlock: string,
    numericalBlock: string,
    powerBlock: string,
    eraBlock: string,
  ): string {
    const numericalSystemOverrides = gp.numericalSystem
      ? `numericalSystemOverrides:\n  hardCap: (decide from setting)\n  resourceTypes: [(core resource types)]`
      : "";

    const loadedTemplate = PromptLoader.loadRequiredPrompt("architect_system_en.md");
    return loadedTemplate
      .replace("{{platform}}", book.platform)
      .replace("{{genre}}", gp.name)
      .replace("{{genreId}}", book.genre)
      .replace("{{targetChapters}}", String(book.targetChapters))
      .replace("{{chapterWordCount}}", String(book.chapterWordCount))
      .replace("{{title}}", book.title)
      .replace("{{genreBody}}", genreBody)
      .replace("{{numericalBlock}}", numericalBlock)
      .replace("{{powerBlock}}", powerBlock)
      .replace("{{eraBlock}}", eraBlock)
      .replace("{{contextBlock}}", contextBlock)
      .replace("{{reviewFeedbackBlock}}", reviewFeedbackBlock)
      .replace("{{numericalSystemOverrides}}", numericalSystemOverrides);
  }

  private parseSections(content: string, language: "zh" | "en"): ArchitectOutput {
    const parsedSections = new Map<string, string>();
    const sectionPattern = /^\s*===\s*SECTION\s*[：:]\s*([^\n=]+?)\s*===\s*$/gim;
    const matches = [...content.matchAll(sectionPattern)];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]!;
      const rawName = match[1] ?? "";
      const start = (match.index ?? 0) + match[0].length;
      const end = matches[i + 1]?.index ?? content.length;
      const normalizedName = this.normalizeSectionName(rawName);
      parsedSections.set(normalizedName, content.slice(start, end).trim());
    }

    // Phase 5 new sections take precedence.
    const storyFrame = parsedSections.get("story_frame") ?? "";
    const volumeMap = parsedSections.get("volume_map") ?? "";
    const rhythmPrinciples = parsedSections.get("rhythm_principles") ?? "";
    const rolesRaw = parsedSections.get("roles") ?? "";

    // Legacy sections (still produced for back-compat where needed).
    // If the model used old section names we still accept them.
    const legacyStoryBible = parsedSections.get("story_bible") ?? "";
    const legacyVolumeOutline = parsedSections.get("volume_outline") ?? "";
    const bookRules = parsedSections.get("book_rules");
    // Phase 5 consolidation: current_state is no longer a required section.
    // Legacy books (v12 / Phase 5 initial / pre-revert) and import/fanfic
    // regenerations may still produce it — accept the value when present,
    // fall through to empty seed when absent (consolidator will populate at
    // runtime). Era/setting anchors that used to motivate a separate
    // current_state block now live naturally inside story_frame.世界观底色
    // for genres that have a real-world year anchor; other genres (修仙/玄幻/
    // 系统文) omit them entirely.
    const currentStateLegacy = parsedSections.get("current_state") ?? "";
    const pendingHooksRaw = parsedSections.get("pending_hooks");

    // 5-section required contract: story_frame (or legacy story_bible),
    // volume_map (or legacy volume_outline), roles, book_rules, pending_hooks.
    //
    // Backward compat: v12 outputs used story_bible/volume_outline and
    // embedded character data inside story_bible — they had no roles block.
    // When the model uses ONLY legacy section names, we accept an empty roles
    // list (consolidator/readers fall back to the character_matrix shim).
    // When the new story_frame / volume_map names are used we require roles.
    const usingLegacyOutlineNames = !storyFrame && !volumeMap
      && (legacyStoryBible.length > 0 || legacyVolumeOutline.length > 0);

    const missing: string[] = [];
    const effectiveStoryFrame = storyFrame || legacyStoryBible;
    const effectiveVolumeMap = volumeMap || legacyVolumeOutline;
    if (!effectiveStoryFrame) missing.push("story_frame");
    if (!effectiveVolumeMap) missing.push("volume_map");
    if (!rolesRaw.trim() && !usingLegacyOutlineNames) missing.push("roles");
    if (!bookRules) missing.push("book_rules");
    if (!pendingHooksRaw) missing.push("pending_hooks");
    if (missing.length > 0) {
      throw new Error(
        `Architect output missing required section${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
      );
    }

    const roles = this.parseRoles(rolesRaw);
    const pendingHooks = this.normalizePendingHooksSection(
      this.stripTrailingAssistantCoda(pendingHooksRaw!),
      effectiveVolumeMap,
    );

    // Synthesize legacy-facing content from new prose (so back-compat callers
    // still receive real content instead of empty strings).
    const storyBible = legacyStoryBible || this.buildStoryBibleShim(effectiveStoryFrame, language);
    const volumeOutline = legacyVolumeOutline || effectiveVolumeMap;

    return {
      storyBible,
      volumeOutline,
      bookRules: bookRules!,
      // currentState: empty string when architect no longer emits the section;
      // writeFoundationFiles seeds current_state.md with a placeholder so
      // consolidator / state-bootstrap readers find a valid file on first boot.
      currentState: currentStateLegacy,
      pendingHooks,
      storyFrame: effectiveStoryFrame,
      volumeMap: effectiveVolumeMap,
      rhythmPrinciples,
      roles,
    };
  }

  /**
   * Parse ---ROLE---...---CONTENT---... blocks from the roles section.
   * Drops malformed entries silently — this is prose the LLM produced,
   * not machine input.
   */
  private parseRoles(raw: string): ReadonlyArray<ArchitectRole> {
    if (!raw.trim()) return [];

    const blocks = raw.split(/^---ROLE---$/m).map((chunk) => chunk.trim()).filter(Boolean);
    const roles: ArchitectRole[] = [];

    for (const block of blocks) {
      const contentSplit = block.split(/^---CONTENT---$/m);
      if (contentSplit.length < 2) continue;

      const headerRaw = contentSplit[0]!.trim();
      const content = contentSplit.slice(1).join("\n---CONTENT---\n").trim();

      const tierMatch = headerRaw.match(/tier\s*[:：]\s*(major|minor|主要|次要)/i);
      const nameMatch = headerRaw.match(/name\s*[:：]\s*(.+)/i);
      if (!tierMatch || !nameMatch) continue;

      const tierValue = tierMatch[1]!.toLowerCase();
      const tier: "major" | "minor" = (tierValue === "major" || tierValue === "主要") ? "major" : "minor";
      const name = nameMatch[1]!.trim();
      if (!name || !content) continue;

      roles.push({ tier, name, content });
    }

    return roles;
  }

  private buildStoryBibleShim(storyFrame: string, language: "zh" | "en"): string {
    if (language === "en") {
      return `# Story Bible (compat pointer — deprecated)\n\n> This file is kept for external readers only. The authoritative source is now:\n> - outline/story_frame.md (theme / tonal ground / core conflict / world rules / endgame)\n> - outline/volume_map.md (chapter-granular plot map)\n> - roles/ directory (one-file-per-character sheets)\n\n## Excerpt from story_frame\n\n${storyFrame.slice(0, 2000)}\n`;
    }
    return `# 故事圣经（兼容指针——已废弃）\n\n> 本文件仅为外部读取保留。权威来源已迁移至：\n> - outline/story_frame.md（主题 / 基调 / 核心冲突 / 世界铁律 / 终局）\n> - outline/volume_map.md（章级别的分卷地图）\n> - roles/ 文件夹（一人一卡角色档案）\n\n## story_frame 摘录\n\n${storyFrame.slice(0, 2000)}\n`;
  }

  private buildCharacterMatrixShim(roles: ReadonlyArray<ArchitectRole>, language: "zh" | "en"): string {
    const majorLines = roles.filter((role) => role.tier === "major")
      .map((role) => `- roles/主要角色/${role.name}.md`);
    const minorLines = roles.filter((role) => role.tier === "minor")
      .map((role) => `- roles/次要角色/${role.name}.md`);

    if (language === "en") {
      return `# Character Matrix (compat pointer — deprecated)\n\n> This file is kept for external readers only. Authoritative source is now the roles/ directory (one-file-per-character).\n\n## Major characters\n\n${majorLines.join("\n") || "(none)"}\n\n## Minor characters\n\n${minorLines.join("\n") || "(none)"}\n`;
    }
    return `# 角色矩阵（兼容指针——已废弃）\n\n> 本文件仅为外部读取保留。权威来源已迁移至 roles/ 文件夹（一人一卡）。\n\n## 主要角色\n\n${majorLines.join("\n") || "（无）"}\n\n## 次要角色\n\n${minorLines.join("\n") || "（无）"}\n`;
  }

  private buildBookRulesShim(bookRulesBody: string, language: "zh" | "en"): string {
    const trimmedBody = bookRulesBody.trim();
    if (language === "en") {
      const excerpt = trimmedBody
        ? `\n\n## Narrative guidance excerpt\n\n${trimmedBody}\n`
        : "";
      return `# Book Rules (compat pointer — deprecated)\n\n> This file is kept for external readers only. The authoritative YAML frontmatter (protagonist / prohibitions / genreLock / ...) now lives at the top of outline/story_frame.md. readBookRules() prefers that location and only falls back here for books initialized before Phase 5 cleanup #3.${excerpt}`;
    }
    const excerpt = trimmedBody
      ? `\n\n## 叙事指引摘录\n\n${trimmedBody}\n`
      : "";
    return `# 本书规则（兼容指针——已废弃）\n\n> 本文件仅为外部读取保留。权威 YAML frontmatter（protagonist / prohibitions / genreLock / ...）已迁移至 outline/story_frame.md 顶部。readBookRules() 优先读那里，只有 Phase 5 cleanup #3 之前的老书才会回退到本文件。${excerpt}`;
  }

  // -------------------------------------------------------------------------
  // File writing
  // -------------------------------------------------------------------------
  async writeFoundationFiles(
    bookDir: string,
    output: ArchitectOutput,
    _numericalSystem: boolean = true,
    language: "zh" | "en" = "zh",
    mode: "init" | "revise" = "init",
  ): Promise<void> {
    const storyDir = join(bookDir, "story");
    const outlineDir = join(storyDir, "outline");
    const rolesDir = join(storyDir, "roles");
    const rolesMajorDir = join(rolesDir, "主要角色");
    const rolesMinorDir = join(rolesDir, "次要角色");

    await Promise.all([
      mkdir(storyDir, { recursive: true }),
      mkdir(outlineDir, { recursive: true }),
      mkdir(rolesMajorDir, { recursive: true }),
      mkdir(rolesMinorDir, { recursive: true }),
    ]);

    const writes: Array<Promise<void>> = [];

    const storyFrameBody = output.storyFrame ?? output.storyBible;
    const volumeMap = output.volumeMap ?? output.volumeOutline;
    const rhythmPrinciples = output.rhythmPrinciples ?? "";
    const roles = output.roles ?? [];
    const isPhase5Output = Boolean(output.storyFrame?.trim());

    if (mode === "revise" && !isPhase5Output) {
      throw new Error(
        "Architect revise mode produced legacy-format output (storyFrame empty). " +
        "The book's architecture files have NOT been modified.",
      );
    }

    if (mode === "revise") {
      await rm(rolesMajorDir, { recursive: true, force: true });
      await rm(rolesMinorDir, { recursive: true, force: true });
      await mkdir(rolesMajorDir, { recursive: true });
      await mkdir(rolesMinorDir, { recursive: true });
    }

    if (!isPhase5Output) {
      writes.push(writeFile(join(storyDir, "story_bible.md"), output.storyBible, "utf-8"));
      writes.push(writeFile(join(storyDir, "volume_outline.md"), output.volumeOutline, "utf-8"));
      writes.push(writeFile(join(storyDir, "book_rules.md"), output.bookRules, "utf-8"));
      writes.push(writeFile(
        join(storyDir, "character_matrix.md"),
        language === "en"
          ? "# Character Matrix\n\n<!-- One ## section per character. Add new characters as new ## blocks. -->\n"
          : "# 角色矩阵\n\n<!-- 每个角色一个 ## 块，新角色追加新 ## 即可。 -->\n",
        "utf-8",
      ));

      if (mode === "init") {
        const currentStateSeed = output.currentState?.trim()
          ? output.currentState
          : (language === "en"
              ? "# Current State\n\n> Seeded at book creation. Runtime state is appended by the consolidator after each chapter.\n"
              : "# 当前状态\n\n> 建书时占位。运行时每章之后由 consolidator 追加最新状态。\n");
        writes.push(writeFile(join(storyDir, "current_state.md"), currentStateSeed, "utf-8"));
        writes.push(writeFile(join(storyDir, "pending_hooks.md"), output.pendingHooks, "utf-8"));
        writes.push(writeFile(
          join(storyDir, "emotional_arcs.md"),
          language === "en"
            ? "# Emotional Arcs\n\n| Character | Chapter | Emotional State | Trigger Event | Intensity (1-10) | Arc Direction |\n| --- | --- | --- | --- | --- | --- |\n"
            : "# 情感弧线\n\n| 角色 | 章节 | 情绪状态 | 触发事件 | 强度(1-10) | 弧线方向 |\n|------|------|----------|----------|------------|----------|\n",
          "utf-8",
        ));
      }

      await Promise.all(writes);
      return;
    }

    // Cleanup #3: book_rules YAML frontmatter is now the authoritative
    // schema for structured fields (protagonist, prohibitions, …). We prepend
    // it to story_frame.md so readers have one canonical place to look.
    // book_rules.md becomes a compat shim.
    const { frontmatter: bookRulesFrontmatter, body: bookRulesBody } =
      extractYamlFrontmatter(output.bookRules);
    const storyFrame = bookRulesFrontmatter
      ? `${bookRulesFrontmatter}\n\n${storyFrameBody.trim()}\n`
      : storyFrameBody;

    // Phase 5 primary prose files
    writes.push(writeFile(join(outlineDir, "story_frame.md"), storyFrame, "utf-8"));
    writes.push(writeFile(join(outlineDir, "volume_map.md"), volumeMap, "utf-8"));
    // Phase 5 consolidation: rhythm principles live inside the last paragraph
    // of volume_map. A separate 节奏原则.md / rhythm_principles.md file is only
    // written when the architect happened to produce a standalone block (legacy
    // 7-section output / foundation-reviewer round-trips that still split it
    // out). Skipping the empty write avoids 0-byte files that mislead the UI
    // and fight against the "no duplication" rule — readers who need the rhythm
    // content already pull it from volume_map's closing paragraph.
    if (rhythmPrinciples.trim()) {
      const rhythmFileName = language === "en" ? "rhythm_principles.md" : "节奏原则.md";
      writes.push(writeFile(join(outlineDir, rhythmFileName), rhythmPrinciples, "utf-8"));
    }

    // Roles — one file per character
    for (const role of roles) {
      const targetDir = role.tier === "major" ? rolesMajorDir : rolesMinorDir;
      const safeName = role.name.replace(/[/\\:*?"<>|]/g, "_").trim();
      if (!safeName) continue;
      writes.push(writeFile(join(targetDir, `${safeName}.md`), role.content, "utf-8"));
    }

    // Compat shims — these are pointer files, not authoritative content.
    writes.push(writeFile(
      join(storyDir, "story_bible.md"),
      this.buildStoryBibleShim(storyFrame, language),
      "utf-8",
    ));
    writes.push(writeFile(
      join(storyDir, "character_matrix.md"),
      this.buildCharacterMatrixShim(roles, language),
      "utf-8",
    ));

    // Cleanup #1: volume_outline.md mirror removed. All readers now resolve
    // through readVolumeMap() in utils/outline-paths.ts, which prefers
    // outline/volume_map.md and falls back to legacy volume_outline.md for
    // books initialized before Phase 5.

    // book_rules.md is now a compat shim — the authoritative YAML
    // frontmatter lives on story_frame.md (cleanup #3). readBookRules()
    // prefers story_frame.md but still falls back here for older books.
    writes.push(writeFile(
      join(storyDir, "book_rules.md"),
      this.buildBookRulesShim(bookRulesBody, language),
      "utf-8",
    ));

    // Runtime state files.
    // Phase 5 consolidation: the architect no longer emits a current_state
    // section (only 3 genres — 港综同人/年代文/都市重生 — benefit from a
    // separate era anchor, and those fold naturally into story_frame.世界观底色).
    // We still write current_state.md with a seed placeholder so
    // isCompleteBookDirectory() sees it on first boot and the runtime
    // consolidator has a file to append each chapter's state into.
    // Per-character state lives in roles/*.Current_State; initial hook rows
    // live in pending_hooks with start_chapter=0. Legacy books / imports that
    // still produced the section keep their content as-is.
    if (mode === "init") {
      const currentStateSeed = output.currentState?.trim()
        ? output.currentState
        : (language === "en"
            ? "# Current State\n\n> Seeded at book creation. Runtime state is appended by the consolidator after each chapter. Initial per-character state lives in roles/*.Current_State; load-bearing initial world facts live in pending_hooks rows with start_chapter=0.\n"
            : "# 当前状态\n\n> 建书时占位。运行时每章之后由 consolidator 追加最新状态。每个角色的初始状态详见 roles/*.当前现状；承重的初始世界设定见 pending_hooks 里 startChapter=0 的行。\n");
      writes.push(writeFile(join(storyDir, "current_state.md"), currentStateSeed, "utf-8"));
      writes.push(writeFile(join(storyDir, "pending_hooks.md"), output.pendingHooks, "utf-8"));
      writes.push(writeFile(
        join(storyDir, "emotional_arcs.md"),
        language === "en"
          ? "# Emotional Arcs\n\n| Character | Chapter | Emotional State | Trigger Event | Intensity (1-10) | Arc Direction |\n| --- | --- | --- | --- | --- | --- |\n"
          : "# 情感弧线\n\n| 角色 | 章节 | 情绪状态 | 触发事件 | 强度(1-10) | 弧线方向 |\n|------|------|----------|----------|------------|----------|\n",
        "utf-8",
      ));
    }

    // Cleanup #2 (Option B): particle_ledger.md / subplot_board.md /
    // chapter_summaries.md are pure runtime logs appended by the writer's
    // settlement phase. The architect no longer seeds them here — mixing a
    // static "setting" seed with a runtime "append log" was the dual-purpose
    // mess that prompted the cleanup. If they don't exist yet, downstream
    // readers see the placeholder and the first chapter settlement creates
    // them naturally. The `_numericalSystem` parameter is kept for API
    // compatibility with existing callers.

    await Promise.all(writes);
  }

  /**
   * Reverse-engineer foundation from existing chapters.
   */
  async generateFoundationFromImport(
    book: BookConfig,
    chaptersText: string,
    externalContext?: string,
    reviewFeedback?: string,
    options?: { readonly importMode?: "continuation" | "series" },
  ): Promise<ArchitectOutput> {
    const { profile: gp, body: genreBody } =
      await readGenreProfile(this.ctx.projectRoot, book.genre);
    const resolvedLanguage = book.language ?? gp.language;
    const reviewFeedbackBlock = this.buildReviewFeedbackBlock(reviewFeedback, resolvedLanguage);

    const contextBlock = externalContext
      ? (resolvedLanguage === "en"
          ? `\n\n## External Instructions\n${externalContext}\n`
          : `\n\n## 外部指令\n${externalContext}\n`)
      : "";

    const numericalBlock = gp.numericalSystem
      ? (resolvedLanguage === "en"
          ? "- The story uses a trackable numerical/resource system"
          : "- 有明确的数值/资源体系可追踪")
      : (resolvedLanguage === "en"
          ? "- No explicit numerical system"
          : "- 本题材无数值系统");

    const isSeries = options?.importMode === "series";

    const continuationDirective = resolvedLanguage === "en"
      ? (isSeries
          ? `## Continuation Direction Requirements
The continuation portion must open up new narrative space — new conflict vector, new location, new time horizon. Ignite within 5 chapters; at least 50% fresh scenes.`
          : `## Continuation Direction
Naturally extend the existing arc. Advance existing conflicts, pay off planted hooks, introduce new complications organically.`)
      : (isSeries
          ? `## 续写方向要求
续写必须引入新叙事空间——新冲突、新地点、新时间。5章内引爆，50%以上场景新鲜。`
          : `## 续写方向
自然延续已有叙事弧线。推进现有冲突、兑现已埋伏笔、引入有机新变数。`);

    const systemPrompt = resolvedLanguage === "en"
      ? `You are a professional novel architect. Reverse-engineer a prose-density foundation from the source chapters and write the continuation path.${contextBlock}${reviewFeedbackBlock}

## Book metadata
- Title: ${book.title}
- Platform: ${book.platform}
- Genre: ${gp.name} (${book.genre})
- Target chapters: ${book.targetChapters}
- Chapter length: ${book.chapterWordCount}

## Genre body
${genreBody}

${numericalBlock}

${continuationDirective}

## Output contract
Follow the consolidated 5-section === SECTION: === layout: story_frame, volume_map, roles, book_rules, pending_hooks. Do NOT emit rhythm_principles or current_state — rhythm principles live in the last paragraph of volume_map; character initial status lives in roles.Current_State; initial hooks live in pending_hooks start_chapter=0 rows; era / setting anchors (only when the genre pins to a real year) are woven into story_frame's world-tonal-ground paragraph.

All prose must be derived from the source package. Do not invent settings. If the package says it is compressed, treat chapter catalog + excerpts as evidence for the foundation; the full chapters will be replayed later for detailed truth files. For volume_map, treat existing chapters as "review" (one paragraph) and continuation as prose chapter-level planning. Hook extraction must be complete for the evidence provided.

All output MUST be written in English.`
      : `你是专业的网络小说架构师。从已有章节中反向推导散文密度的基础设定，同时设计续写路径。${contextBlock}${reviewFeedbackBlock}

## 书籍元信息
- 标题：${book.title}
- 平台：${book.platform}
- 题材：${gp.name}（${book.genre}）
- 目标章数：${book.targetChapters}章

## 题材底色
${genreBody}

${numericalBlock}

${continuationDirective}

## 输出契约
合并后的 5 段 === SECTION: === 结构：story_frame / volume_map / roles / book_rules / pending_hooks。**不要输出 rhythm_principles 或 current_state 两个 section**——节奏原则合并进 volume_map 尾段，角色初始状态合并进 roles.当前现状，初始钩子写在 pending_hooks startChapter=0 行；环境/时代锚（只有年代文 / 历史同人 / 都市重生等真实年份题材需要）织进 story_frame.世界观底色，其他题材直接省略。

所有 prose 必须从资料包中推导，不得臆造。若资料包声明为压缩包，把章节目录和正文摘录当作基础设定证据；完整章节会在后续回放阶段逐章进入 truth files。volume_map 中，已有章节作为"回顾段"（一段散文），续写部分写到章级 prose。伏笔识别以资料包提供的证据为准，尽量完整。`;

    const userMessage = resolvedLanguage === "en"
      ? `Generate the complete foundation for an imported ${gp.name} novel titled "${book.title}". Write everything in English.\n\n${chaptersText}`
      : `以下是《${book.title}》的已有正文资料包，请从中反向推导完整基础设定：\n\n${chaptersText}`;

    const response = await this.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ], { temperature: 0.5 });

    return this.parseSections(response.content, resolvedLanguage);
  }

  async generateFanficFoundation(
    book: BookConfig,
    fanficCanon: string,
    fanficMode: FanficMode,
    reviewFeedback?: string,
  ): Promise<ArchitectOutput> {
    const { profile: gp, body: genreBody } =
      await readGenreProfile(this.ctx.projectRoot, book.genre);
    const reviewFeedbackBlock = this.buildReviewFeedbackBlock(reviewFeedback, book.language ?? "zh");

    const MODE_INSTRUCTIONS: Record<FanficMode, string> = {
      canon: "剧情发生在原作空白期或未详述的角度。不可改变原作已确立的事实。",
      au: "标注AU设定与原作的关键分歧点，分歧后的世界线自由发展。保留角色核心性格。",
      ooc: "标注角色性格偏离的起点和驱动事件。偏离必须有逻辑驱动。",
      cp: "以配对角色的关系线为主线规划卷纲。每卷必须有关系推进节点。",
    };

    const systemPrompt = `你是专业同人架构师。基于原作正典为同人生成散文密度的基础设定。

## 同人模式：${fanficMode}
${MODE_INSTRUCTIONS[fanficMode]}

## 新时空要求
必须为这本同人设计原创叙事空间，不是复述原作剧情：
1. 明确分岔点——story_frame 必须标注本作从原作的哪个节点分岔
2. 独立核心冲突——volume_map 的核心冲突必须是原创的
3. 5章内引爆
4. 场景新鲜度 ≥ 50%
${reviewFeedbackBlock}

## 原作正典
${fanficCanon}

## 题材底色
${genreBody}

## 输出契约
严格按合并后的 5 段 === SECTION: === 块输出：story_frame / volume_map / roles / book_rules / pending_hooks。**不要输出 rhythm_principles 或 current_state**：节奏原则合并进 volume_map 尾段；角色初始状态写在 roles.当前现状，初始钩子写在 pending_hooks startChapter=0 行；环境/时代锚（仅当同人的原作/本作锚定真实年份时）织进 story_frame.世界观底色，其他情况省略。

- 主要角色必须来自原作正典
- 可添加原创配角，标注"原创"
- book_rules 的 fanficMode 必须设为 "${fanficMode}"
- book_rules 只输出 YAML frontmatter，散文写进 story_frame.世界观底色
- 主角弧线只写在 roles/主要角色/<主角>.md，不在 story_frame 重复
- 所有 outline 必须是散文密度`;

    const response = await this.chat([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `请为标题为"${book.title}"的${fanficMode}模式同人小说生成基础设定。目标${book.targetChapters}章，每章${book.chapterWordCount}字。`,
      },
    ], { temperature: 0.7 });

    return this.parseSections(response.content, book.language ?? "zh");
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  private buildReviewFeedbackBlock(
    reviewFeedback: string | undefined,
    language: "zh" | "en",
  ): string {
    const trimmed = reviewFeedback?.trim();
    if (!trimmed) return "";

    if (language === "en") {
      return `\n\n## Previous Review Feedback
The previous foundation draft was rejected. You must explicitly fix the following issues in this regeneration instead of paraphrasing the same design:

${trimmed}\n`;
    }

    return `\n\n## 上一轮审核反馈
上一轮基础设定未通过审核。你必须在这次重生中明确修复以下问题，不能只换措辞重写同一套方案：

${trimmed}\n`;
  }

  private normalizeSectionName(name: string): string {
    return name
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[`"'*_]/g, " ")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  private stripTrailingAssistantCoda(section: string): string {
    const lines = section.split("\n");
    const cutoff = lines.findIndex((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return /^(如果(?:你愿意|需要|想要|希望)|If (?:you(?:'d)? like|you want|needed)|I can (?:continue|next))/i.test(trimmed);
    });

    if (cutoff < 0) {
      return section;
    }

    return lines.slice(0, cutoff).join("\n").trimEnd();
  }

  private normalizePendingHooksSection(section: string, volumeMapRaw: string): string {
    const rows = section
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("|"))
      .filter((line) => !line.includes("---"))
      .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
      .filter((cells) => cells.some(Boolean));

    if (rows.length === 0) {
      return section;
    }

    const dataRows = rows.filter((row) => (row[0] ?? "").toLowerCase() !== "hook_id");
    if (dataRows.length === 0) {
      return section;
    }

    const language: "zh" | "en" = /[\u4e00-\u9fff]/.test(section) ? "zh" : "en";
    const normalizedHooks = dataRows.map((row, index) => {
      const rawProgress = row[4] ?? "";
      const normalizedProgress = this.parseHookChapterNumber(rawProgress);
      const seedNote = normalizedProgress === 0 && this.hasNarrativeProgress(rawProgress)
        ? (language === "zh" ? `初始线索：${rawProgress}` : `initial signal: ${rawProgress}`)
        : "";

      const phase7 = row.length >= 12;
      const phase6 = row.length >= 8;
      const noteCellIndex = phase7 ? 11 : phase6 ? 7 : 6;
      const notes = this.mergeHookNotes(row[noteCellIndex] ?? "", seedNote, language);

      const base: Record<string, unknown> = {
        hookId: row[0] || `hook-${index + 1}`,
        startChapter: this.parseHookChapterNumber(row[1]),
        type: row[2] ?? "",
        status: row[3] ?? "open",
        lastAdvancedChapter: normalizedProgress,
        expectedPayoff: row[5] ?? "",
        payoffTiming: phase6 ? row[6] ?? "" : "",
        notes,
      };

      if (phase7) {
        base.dependsOn = this.parseDependsOnCell(row[7] ?? "");
        base.paysOffInArc = (row[8] ?? "").trim();
        base.coreHook = this.parseBooleanCell(row[9]);
        const halfLife = this.parseOptionalInt(row[10]);
        if (halfLife !== undefined) base.halfLifeChapters = halfLife;
      }

      return base as unknown as StoredHook;
    });

    // Phase 7 hotfix 2: pre-promote seeds based on the three structural rules
    // that don't need runtime advanced_count (core_hook / depends_on /
    // cross_volume). advanced_count-based promotion is applied later by the
    // consolidator at volume boundaries.
    const volumeBoundaries = this.parseVolumeBoundariesForPromotion(volumeMapRaw);
    const allSeedStartChapters = new Map<string, number>(
      normalizedHooks.map((hook) => [hook.hookId, hook.startChapter]),
    );
    const promotionContext: PromotionContext = {
      volumeBoundaries,
      currentChapter: 0,
      advancedCounts: new Map(),
      allSeedStartChapters,
    };
    const promotedHooks = normalizedHooks.map((hook) => {
      const decision = shouldPromoteHook(hook, promotionContext);
      return { ...hook, promoted: decision.promote };
    });

    return renderHookSnapshot(
      promotedHooks as unknown as Parameters<typeof renderHookSnapshot>[0],
      language,
    );
  }

  /**
   * Parse `第N卷 (A-B章)` / `Volume N (chapters A-B)` headers from the
   * architect's volume_map prose. Best-effort: missing / unparseable blocks
   * return an empty list and cross-volume promotion simply never fires.
   */
  private parseVolumeBoundariesForPromotion(raw: string): ReadonlyArray<VolumeBoundary> {
    if (!raw) return [];
    const lines = raw.split("\n");
    const volumeHeader = /^(第[一二三四五六七八九十百千万零〇\d]+卷|Volume\s+\d+)/i;
    const rangePattern = /[（(]\s*(?:第|[Cc]hapters?\s+)?(\d+)\s*[-–~～—]\s*(\d+)\s*(?:章)?\s*[）)]|(?:第|[Cc]hapters?\s+)(\d+)\s*[-–~～—]\s*(\d+)\s*(?:章)?/i;

    const volumes: VolumeBoundary[] = [];
    for (const rawLine of lines) {
      const line = rawLine.replace(/^#+\s*/, "").trim();
      if (!volumeHeader.test(line)) continue;
      const rangeMatch = line.match(rangePattern);
      if (!rangeMatch) continue;
      const startCh = parseInt(rangeMatch[1] ?? rangeMatch[3] ?? "0", 10);
      const endCh = parseInt(rangeMatch[2] ?? rangeMatch[4] ?? "0", 10);
      if (startCh <= 0 || endCh <= 0) continue;
      const rangeIndex = rangeMatch.index ?? line.length;
      const name = line.slice(0, rangeIndex).replace(/[（(]\s*$/, "").trim();
      if (name.length > 0) {
        volumes.push({ name, startCh, endCh });
      }
    }
    return volumes;
  }

  private parseHookChapterNumber(value: string | undefined): number {
    if (!value) return 0;
    const match = value.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  private parseDependsOnCell(value: string): ReadonlyArray<string> {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const lower = trimmed.toLowerCase();
    if (lower === "none" || lower === "n/a" || lower === "-" || trimmed === "无") return [];
    const stripped = trimmed.replace(/^[\[\(]\s*/, "").replace(/\s*[\]\)]$/, "");
    return stripped
      .split(/[,，、\/]+/)
      .map((item) => item.trim().replace(/^\*\*(.+)\*\*$/, "$1").trim())
      .filter((item) => item.length > 0);
  }

  private parseBooleanCell(value: string | undefined): boolean {
    const normalized = (value ?? "").trim().toLowerCase();
    if (!normalized) return false;
    return /^(true|yes|y|是|核心|core|1|✓|✔)$/.test(normalized);
  }

  private parseOptionalInt(value: string | undefined): number | undefined {
    const normalized = (value ?? "").trim();
    if (!normalized) return undefined;
    const match = normalized.match(/\d+/);
    if (!match) return undefined;
    const parsed = parseInt(match[0], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  private hasNarrativeProgress(value: string | undefined): boolean {
    const normalized = (value ?? "").trim().toLowerCase();
    if (!normalized) return false;
    return !["0", "none", "n/a", "na", "-", "无", "未推进"].includes(normalized);
  }

  private mergeHookNotes(notes: string, seedNote: string, language: "zh" | "en"): string {
    const trimmedNotes = notes.trim();
    const trimmedSeed = seedNote.trim();
    if (!trimmedSeed) {
      return trimmedNotes;
    }
    if (!trimmedNotes) {
      return trimmedSeed;
    }
    return language === "zh"
      ? `${trimmedNotes}（${trimmedSeed}）`
      : `${trimmedNotes} (${trimmedSeed})`;
  }
}
