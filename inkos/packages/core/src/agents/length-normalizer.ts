import { BaseAgent } from "./base.js";
import type { LengthNormalizeMode, LengthSpec } from "../models/length-governance.js";
import { countChapterLength, chooseNormalizeMode, isOutsideHardRange, isOutsideSoftRange } from "../utils/length-metrics.js";
import { PromptLoader } from "../prompts/prompt-loader.js";

export interface NormalizeLengthInput {
  readonly chapterContent: string;
  readonly lengthSpec: LengthSpec;
  readonly chapterIntent?: string;
  readonly reducedControlBlock?: string;
}

export interface NormalizeLengthOutput {
  readonly normalizedContent: string;
  readonly finalCount: number;
  readonly applied: boolean;
  readonly mode: LengthNormalizeMode;
  readonly warning?: string;
  readonly tokenUsage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
}

export class LengthNormalizerAgent extends BaseAgent {
  get name(): string {
    return "length-normalizer";
  }

  async normalizeChapter(input: NormalizeLengthInput): Promise<NormalizeLengthOutput> {
    const originalCount = countChapterLength(input.chapterContent, input.lengthSpec.countingMode);
    const mode = input.lengthSpec.normalizeMode === "none"
      ? chooseNormalizeMode(originalCount, input.lengthSpec)
      : input.lengthSpec.normalizeMode;

    if (mode === "none") {
      return {
        normalizedContent: input.chapterContent,
        finalCount: originalCount,
        applied: false,
        mode,
      };
    }

    const systemPrompt = this.buildSystemPrompt(mode);
    const userPrompt = this.buildUserPrompt(input, originalCount, mode);
    const response = await this.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: 0.2,
      },
    );

    const sanitizedContent = this.sanitizeNormalizedContent(response.content, input.chapterContent);
    const sanitizedCount = countChapterLength(sanitizedContent, input.lengthSpec.countingMode);
    const wasTruncated = sanitizedContent !== input.chapterContent
      && sanitizedCount < input.lengthSpec.hardMin
      && this.looksTruncated(sanitizedContent);
    const normalizedContent = wasTruncated ? input.chapterContent : sanitizedContent;
    const finalCount = countChapterLength(normalizedContent, input.lengthSpec.countingMode);
    const warning = wasTruncated
      ? "Length normalizer output appeared truncated; kept original chapter."
      : this.buildWarning(finalCount, input.lengthSpec);

    return {
      normalizedContent,
      finalCount,
      applied: true,
      mode,
      warning,
      tokenUsage: response.usage,
    };
  }

  private buildSystemPrompt(mode: LengthNormalizeMode): string {
    const action = mode === "compress"
      ? "compress"
      : "expand";

    return PromptLoader.loadRequiredPrompt("length_normalizer_system.md")
      .replaceAll("{{action}}", action);
  }

  private buildUserPrompt(
    input: NormalizeLengthInput,
    originalCount: number,
    mode: LengthNormalizeMode,
  ): string {
    const intentBlock = input.chapterIntent
      ? `\n## Chapter Intent\n${input.chapterIntent}\n`
      : "";
    const controlBlock = input.reducedControlBlock
      ? `\n## Reduced Control Block\n${input.reducedControlBlock}\n`
      : "";
    const modeVerb = mode === "compress" ? "压缩" : "扩写";

    return PromptLoader.loadRequiredPrompt("length_normalizer_user.md")
      .replaceAll("{{modeVerb}}", modeVerb)
      .replaceAll("{{target}}", String(input.lengthSpec.target))
      .replaceAll("{{softMin}}", String(input.lengthSpec.softMin))
      .replaceAll("{{softMax}}", String(input.lengthSpec.softMax))
      .replaceAll("{{hardMin}}", String(input.lengthSpec.hardMin))
      .replaceAll("{{hardMax}}", String(input.lengthSpec.hardMax))
      .replaceAll("{{countingMode}}", input.lengthSpec.countingMode)
      .replaceAll("{{originalCount}}", String(originalCount))
      .replaceAll("{{intentBlock}}", intentBlock)
      .replaceAll("{{controlBlock}}", controlBlock)
      .replaceAll("{{chapterContent}}", input.chapterContent);
  }

  private buildWarning(finalCount: number, lengthSpec: LengthSpec): string | undefined {
    if (!isOutsideSoftRange(finalCount, lengthSpec)) {
      return undefined;
    }

    if (isOutsideHardRange(finalCount, lengthSpec)) {
      return `Final count ${finalCount} is outside the hard range ${lengthSpec.hardMin}-${lengthSpec.hardMax} after one normalization pass.`;
    }

    return `Final count ${finalCount} is outside the soft range ${lengthSpec.softMin}-${lengthSpec.softMax} after one normalization pass.`;
  }

  private sanitizeNormalizedContent(rawContent: string, fallbackContent: string): string {
    const trimmed = rawContent.trim();
    if (!trimmed) return fallbackContent;

    const fenced = this.extractFirstFencedBlock(trimmed);
    if (fenced) return fenced;

    const stripped = this.stripCommonWrappers(trimmed);
    if (stripped !== undefined) {
      // Empty after stripping = response was only wrapper text, use original
      if (!stripped) return fallbackContent;
      // Guard: if stripping removed more than 50% of content, the regex was too aggressive.
      if (stripped.length < trimmed.length * 0.5) return trimmed;
      return stripped;
    }

    return trimmed;
  }

  private looksTruncated(content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed) return false;
    if (trimmed.endsWith("```")) return false;
    if (/[。！？!?」』”’）)\]】》…]$/.test(trimmed)) return false;
    if (/\n\s*$/.test(content) && /[，,；;：:]$/.test(trimmed)) return true;
    return /[，,；;：:、]$/.test(trimmed) || /[\u4e00-\u9fffA-Za-z0-9]$/.test(trimmed);
  }

  private extractFirstFencedBlock(content: string): string | undefined {
    const match = content.match(/```(?:[a-zA-Z-]+)?\s*\n([\s\S]*?)\n```/);
    if (!match) return undefined;
    const body = match[1]?.trim();
    return body ? body : undefined;
  }

  private stripCommonWrappers(content: string): string | undefined {
    const lines = content.split("\n");
    let removedAny = false;
    const keptLines: string[] = [];

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (this.isWrapperLine(trimmed)) {
        removedAny = true;
        continue;
      }
      keptLines.push(rawLine);
    }

    if (!removedAny) {
      return undefined;
    }

    return keptLines.join("\n").trim();
  }

  private isWrapperLine(line: string): boolean {
    if (!line) return false;
    if (/^```/.test(line)) return true;
    if (/^#+\s*(说明|解释|注释|analysis|analysis note)\b/i.test(line)) return true;

    if (/^(下面是|以下是).*(正文|章节|压缩|扩写|修正|修改|调整|改写|润色|结果|内容|输出|版本)/i.test(line)) {
      return true;
    }

    if (/^我先.*(压缩|扩写|修正|修改|调整|改写|润色|处理).*(正文|章节)?/i.test(line)) {
      return true;
    }

    if (/^(here(?:'s| is)|below is).*(chapter|draft|content|rewrite|revised|compressed|expanded|normalized|adjusted|output|version|result)/i.test(line)) {
      return true;
    }

    if (/^i(?:'ll| will)\s+(rewrite|revise|reword|compress|expand|normalize|adjust|shorten|lengthen|trim|fix)\b/i.test(line)) {
      return true;
    }

    return false;
  }
}
