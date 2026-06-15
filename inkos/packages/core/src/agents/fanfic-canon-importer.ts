import { BaseAgent } from "./base.js";
import type { FanficMode } from "../models/book.js";
import { PromptLoader } from "../prompts/prompt-loader.js";

export interface FanficCanonOutput {
  readonly worldRules: string;
  readonly characterProfiles: string;
  readonly keyEvents: string;
  readonly powerSystem: string;
  readonly writingStyle: string;
  readonly fullDocument: string;
}

const MODE_LABELS: Record<FanficMode, string> = {
  canon: "原作向（严格遵守原作设定）",
  au: "AU/平行世界（世界规则可改，角色保留）",
  ooc: "OOC（角色性格可偏离原作）",
  cp: "CP（以配对关系为核心）",
};

export class FanficCanonImporter extends BaseAgent {
  get name(): string {
    return "fanfic-canon-importer";
  }

  async importFromText(
    sourceText: string,
    sourceName: string,
    fanficMode: FanficMode,
  ): Promise<FanficCanonOutput> {
    // Truncate if too long (>50k chars ≈ ~25k words)
    const maxLen = 50000;
    const truncated = sourceText.length > maxLen;
    const text = truncated ? sourceText.slice(0, maxLen) : sourceText;

    const modeLabel = MODE_LABELS[fanficMode];

    const systemPrompt = PromptLoader.loadRequiredPrompt("fanfic_importer_system.md")
      .replaceAll("{{modeLabel}}", modeLabel)
      .replaceAll("{{truncatedBlock}}", truncated ? "\n注意：原作素材过长，已截断。请基于已有部分提取。" : "");

    const response = await this.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `以下是原作《${sourceName}》的素材：\n\n${text}` },
      ],
      { temperature: 0.3 },
    );

    const content = response.content;
    const extract = (tag: string): string => {
      const regex = new RegExp(
        `=== SECTION: ${tag} ===\\s*([\\s\\S]*?)(?==== SECTION:|$)`,
      );
      const match = content.match(regex);
      return match?.[1]?.trim() ?? "";
    };

    const worldRules = extract("world_rules");
    const characterProfiles = extract("character_profiles");
    const keyEvents = extract("key_events");
    const powerSystem = extract("power_system");
    const writingStyle = extract("writing_style");

    const meta = [
      "---",
      "meta:",
      `  sourceFile: "${sourceName}"`,
      `  fanficMode: "${fanficMode}"`,
      `  generatedAt: "${new Date().toISOString()}"`,
    ].join("\n");

    const fullDocument = [
      `# 同人正典（《${sourceName}》）`,
      "",
      "## 世界规则",
      worldRules || "（素材中未提取到明确世界规则）",
      "",
      "## 角色档案",
      characterProfiles || "（素材中未提取到角色信息）",
      "",
      "## 关键事件时间线",
      keyEvents || "（素材中未提取到关键事件）",
      "",
      "## 力量体系",
      powerSystem || "（原作无明确力量体系）",
      "",
      "## 原作写作风格",
      writingStyle || "（素材不足以提取风格特征）",
      "",
      meta,
    ].join("\n");

    return { worldRules, characterProfiles, keyEvents, powerSystem, writingStyle, fullDocument };
  }
}
