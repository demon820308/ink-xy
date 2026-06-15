import { BaseAgent } from "./base.js";
import { PromptLoader } from "../prompts/prompt-loader.js";
import type { Platform, Genre } from "../models/book.js";
import type { RadarSource, PlatformRankings } from "./radar-source.js";
import { FanqieRadarSource, QidianRadarSource } from "./radar-source.js";

export interface RadarResult {
  readonly recommendations: ReadonlyArray<RadarRecommendation>;
  readonly marketSummary: string;
  readonly timestamp: string;
}

export interface RadarRecommendation {
  readonly platform: Platform;
  readonly genre: Genre;
  readonly concept: string;
  readonly confidence: number;
  readonly reasoning: string;
  readonly benchmarkTitles: ReadonlyArray<string>;
}

const DEFAULT_SOURCES: ReadonlyArray<RadarSource> = [
  new FanqieRadarSource(),
  new QidianRadarSource(),
];

function formatRankingsForPrompt(rankings: ReadonlyArray<PlatformRankings>): string {
  const sections = rankings
    .filter((r) => r.entries.length > 0)
    .map((r) => {
      const lines = r.entries.map(
        (e) => `- ${e.title}${e.author ? ` (${e.author})` : ""}${e.category ? ` [${e.category}]` : ""} ${e.extra}`,
      );
      return `### ${r.platform}\n${lines.join("\n")}`;
    });

  return sections.length > 0
    ? sections.join("\n\n")
    : "（未能获取到实时排行数据，请基于你的知识分析）";
}

export class RadarAgent extends BaseAgent {
  private readonly sources: ReadonlyArray<RadarSource>;

  constructor(
    ctx: ConstructorParameters<typeof BaseAgent>[0],
    sources?: ReadonlyArray<RadarSource>,
  ) {
    super(ctx);
    this.sources = sources ?? DEFAULT_SOURCES;
  }

  get name(): string {
    return "radar";
  }

  async scan(): Promise<RadarResult> {
    const rankings = await Promise.all(this.sources.map((s) => s.fetch()));
    const rankingsText = formatRankingsForPrompt(rankings);

    const loadedPrompt = PromptLoader.loadRequiredPrompt("radar_system_zh.md");
    const systemPrompt = loadedPrompt.replace("{{rankingsText}}", rankingsText);

    const response = await this.chat(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `请基于上面的实时排行榜数据，分析当前网文市场热度，给出开书建议。`,
        },
      ],
      { temperature: 0.6 },
    );

    return this.parseResult(response.content);
  }

  private parseResult(content: string): RadarResult {
    const firstBrace = content.indexOf("{");
    const firstBracket = content.indexOf("[");
    const startChar = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? "{" : "[";
    const endChar = startChar === "{" ? "}" : "]";
    const startIndex = startChar === "{" ? firstBrace : firstBracket;

    if (startIndex === -1) {
      throw new Error("Radar output format error: no JSON start character found");
    }

    const endIndices: number[] = [];
    let index = content.indexOf(endChar, startIndex);
    while (index !== -1) {
      endIndices.push(index);
      index = content.indexOf(endChar, index + 1);
    }

    let parsed: any = null;
    let success = false;
    let lastError: any = null;

    for (let i = endIndices.length - 1; i >= 0; i--) {
      const candidate = content.slice(startIndex, endIndices[i] + 1);
      try {
        parsed = JSON.parse(candidate);
        success = true;
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!success) {
      throw new Error(`Radar JSON parse error: ${lastError || "no valid JSON substring found"}`);
    }

    return {
      recommendations: parsed.recommendations ?? [],
      marketSummary: parsed.marketSummary ?? "",
      timestamp: new Date().toISOString(),
    };
  }
}
