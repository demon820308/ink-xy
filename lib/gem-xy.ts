import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { GemProfile } from "./types";

export function getGemsFilePath(): string {
  return join(getAgentDir(), "gem_xy.json");
}

export const DEFAULT_GEMS: GemProfile[] = [
  {
    id: "default-outline-planner",
    name: "大纲策划师",
    description: "负责小说微观冲突、宏观结构、大纲与起承转合编排",
    avatar: "🗺️",
    systemPrompt: "你是一位顶级的小说大纲策划师。请帮助创作者梳理故事线、微观冲突、主线结构与起承转合。请关注剧情节奏，确保冲突连贯生动，大纲严谨合理。",
    modelId: "",
    provider: "",
    allowedTools: [],
    knowledgeFiles: [],
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  },
  {
    id: "default-character-smith",
    name: "人设雕琢师",
    description: "负责角色塑造、立体性格、背景动机与对话口吻雕琢",
    avatar: "🔮",
    systemPrompt: "你是一位顶尖的角色塑造专家。请帮助创作者雕琢丰满立体的角色人设。分析人物动机、潜在冲突、性格缺陷以及专属的对话口吻，拒绝扁平化，塑造让人过目不忘的真实人物。",
    modelId: "",
    provider: "",
    allowedTools: [],
    knowledgeFiles: [],
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  },
  {
    id: "default-chapter-expander",
    name: "剧情扩写姬",
    description: "对段落进行润色扩写，增强环境细节与动作神态描写",
    avatar: "✍️",
    systemPrompt: "你是一位精于文字细节与文笔润色的小说扩写专家。请帮助写作者扩写或润色草稿。增加丰富的环境细节、微表情动作描写、感官体验，使文学段落更加细腻动人，保持叙事节奏。",
    modelId: "",
    provider: "",
    allowedTools: [],
    knowledgeFiles: [],
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  },
  {
    id: "default-text-proofreader",
    name: "文字校对姬",
    description: "自动化纠错、常识查证、设定矛盾审计与词语润色",
    avatar: "🔍",
    systemPrompt: "你是一位一丝不苟的专业小说校对编辑。请帮助作者对草稿进行自动纠错、错别字校对、常识查证以及前后设定逻辑矛盾的审计。列出需修正的错漏，并提供优雅的词组替换建议，保持文字纯净通顺。",
    modelId: "",
    provider: "",
    allowedTools: [],
    knowledgeFiles: [],
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  }
];

export function readGems(): GemProfile[] {
  const filePath = getGemsFilePath();
  if (!existsSync(filePath)) {
    try {
      writeGems(DEFAULT_GEMS);
      return DEFAULT_GEMS;
    } catch {
      return DEFAULT_GEMS;
    }
  }
  try {
    const data = readFileSync(filePath, "utf-8");
    return JSON.parse(data) as GemProfile[];
  } catch (error) {
    console.error("Failed to read gem_xy.json:", error);
    return [];
  }
}

export function writeGems(gems: GemProfile[]): void {
  const filePath = getGemsFilePath();
  try {
    writeFileSync(filePath, JSON.stringify(gems, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to write gem_xy.json:", error);
    throw error;
  }
}

export function getGemById(id: string): GemProfile | null {
  const gems = readGems();
  return gems.find((g) => g.id === id) ?? null;
}

export function saveGem(gemData: Partial<GemProfile> & { name: string; systemPrompt: string }): GemProfile {
  const gems = readGems();
  const now = new Date().toISOString();

  let targetGem: GemProfile;

  if (gemData.id) {
    const index = gems.findIndex((g) => g.id === gemData.id);
    if (index !== -1) {
      targetGem = {
        ...gems[index],
        ...gemData,
        modified: now,
      } as GemProfile;
      gems[index] = targetGem;
    } else {
      targetGem = {
        id: gemData.id,
        name: gemData.name,
        description: gemData.description || "",
        avatar: gemData.avatar || "🤖",
        systemPrompt: gemData.systemPrompt,
        modelId: gemData.modelId || "",
        provider: gemData.provider || "",
        allowedTools: gemData.allowedTools || [],
        knowledgeFiles: gemData.knowledgeFiles || [],
        created: now,
        modified: now,
      };
      gems.push(targetGem);
    }
  } else {
    // Generate UUID simple version since crypto is built-in
    const uuid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    targetGem = {
      id: uuid,
      name: gemData.name,
      description: gemData.description || "",
      avatar: gemData.avatar || "🤖",
      systemPrompt: gemData.systemPrompt,
      modelId: gemData.modelId || "",
      provider: gemData.provider || "",
      allowedTools: gemData.allowedTools || [],
      knowledgeFiles: gemData.knowledgeFiles || [],
      created: now,
      modified: now,
    };
    gems.push(targetGem);
  }

  writeGems(gems);
  return targetGem;
}

export function deleteGem(id: string): boolean {
  const gems = readGems();
  const initialLength = gems.length;
  const filtered = gems.filter((g) => g.id !== id);

  if (filtered.length < initialLength) {
    writeGems(filtered);
    return true;
  }
  return false;
}
