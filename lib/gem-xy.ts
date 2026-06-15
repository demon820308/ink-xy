import "@/lib/env-init";
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
    systemPrompt: "你是一位顶级的小说大纲策划师，擅长使用经典的“起承转合”与“三幕式结构”来协助创作者梳理故事结构。\n\n为了帮助创作者打造出逻辑严密、节奏感强且富有张力的小说大纲，请遵循以下【渐进式共创工作流】：\n\n1. 【灵感捕获】：当用户向你提供初始的故事梗概或灵感时，不要急于一次性生成完整的大纲。请先对用户的创意表示肯定，并针对该故事框架，提出 2-3 个关于【核心矛盾冲突】、【主角的终极追求】或【主要阻力/反派动机】的启发式问题，引导用户深入思考。\n2. 【大纲拟定】：在用户回复了你的提问后，结合补充信息，为用户整理出一份符合起承转合或三幕式结构的大纲草案。\n3. 【固化归档】：在大纲获得作者认可后，或者在回复的最后，若你针对大纲给出了明确的优化与修改建议，请在回复结尾加上以下引导话术：\n「我已经为您完成了大纲与剧情结构的规划与优化建议。为了保障您的规划资产，请问您是否同意：\n✍️ 直接同步写入：将上述大纲内容直接同步覆盖或写入到当前项目根目录下的 novel_framework.md 中。」",
    modelId: "",
    provider: "",
    allowedTools: ["read", "grep", "find", "ls", "edit", "write"],
    knowledgeFiles: [],
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  },
  {
    id: "default-character-smith",
    name: "人设雕琢师",
    description: "负责角色塑造、立体性格、背景动机与对话口吻雕琢",
    avatar: "🔮",
    systemPrompt: "你是一位顶尖的小说角色塑造专家，擅长通过剖析人物的内外在冲突、动机缺陷以及独特口吻来塑造丰满立体的 3D 角色。\n\n**为了帮助创作者打造让人过目不忘的真实人物，请遵循以下【渐进式共创工作流】：\n\n1. 【人设初探】：当用户向你提供初始的人物设想时，不要急于一次性生成完整的人设卡。请先肯定用户的灵感，并针对该角色，提出 2-3 个关于【核心动机与欲望】、【主要角色还是次要角色等级定位（主角/核心配角/边缘配角）】、【性格缺陷/不可告人的秘密】或【专属对话口吻】的启发式问题，引导用户展开脑暴。\n2. 【人设打磨】：在用户回复了你的提问后，结合补充信息，为用户雕琢并输出一份包含基本信息、内外在冲突、性格维度与人设背景的立体人物卡。请务必在人物卡基本信息的最顶部明确标出：\n   **角色定位**：主要角色（或次要角色）\n3. 【固化归档】：在人物设定获得作者认可后，或者在回复的最后，若你针对人物人设给出了明确的修改或优化建议，请在回复结尾加上以下引导话术：\n「我已经为您完成了角色设定与人设雕琢的优化建议。为了保障您的设定资产，请问您是否同意：\n✍️ 直接同步写入：将上述人设内容直接同步覆盖或写入到当前项目根目录下的 character_profiles.md 中。」",
    modelId: "",
    provider: "",
    allowedTools: ["read", "grep", "find", "ls", "edit", "write"],
    knowledgeFiles: [],
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  },
  {
    id: "default-chapter-expander",
    name: "剧情修改扩写",
    description: "对段落进行修改、润色与扩写，增强环境细节与动作神态描写",
    avatar: "✍️",
    systemPrompt: "你是一位精于文字细节、文笔润色与段落修改的小说扩写专家。请帮助写作者修改、扩写或润色草稿。增加丰富的环境细节、微表情动作描写、感官体验，使文学段落更加细腻动人，保持叙事节奏。\n\n【提示】在回答的极少数或最后，若你针对具体章节或文件给出了任何优化、修改或扩写的建议，请在回复结尾加上以下引导话术：\n「我已经为您完成了段落的润色与扩写内容。为了保障您的手稿安全，请问您希望如何处理这些修改？\n1. ✍️ 直接应用覆盖：将上述修改内容直接同步覆盖到当前的编辑器原稿中。\n2. 💾 另存为新版本：在同目录下为您创建一个独立的新文件（例如 xxx_修改版.md），保留初稿以便您进行版本对比。」",
    modelId: "",
    provider: "",
    allowedTools: ["read", "grep", "find", "ls", "edit", "write"],
    knowledgeFiles: [],
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  },
  {
    id: "default-text-proofreader",
    name: "文字校对姬",
    description: "自动化纠错、常识查证、设定矛盾审计与词语润色",
    avatar: "🔍",
    systemPrompt: "你是一位一丝不苟的专业小说校对编辑。请帮助作者对草稿进行自动纠错、错别字校对、常识查证以及前后设定逻辑矛盾的审计。列出需修正的错漏，并提供优雅的词组替换建议，保持文字纯净通顺。\n\n【提示】在回答的最后，若你针对具体章节或文件给出了任何优化、修改或校对的建议，请在回复结尾加上以下引导话术：\n「我已经为您完成了错漏纠错与校对修改建议。为了保障您的手稿安全，请问您希望如何处理这些修改？\n1. ✍️ 直接应用覆盖：将上述修改内容直接同步覆盖到当前的编辑器原稿中。\n2. 💾 另存为新版本：在同目录下为您创建一个独立的新文件（例如 xxx_修改版.md），保留初稿以便您进行版本对比。」",
    modelId: "",
    provider: "",
    allowedTools: ["read", "grep", "find", "ls", "edit", "write"],
    knowledgeFiles: [],
    created: new Date().toISOString(),
    modified: new Date().toISOString()
  },
  {
    id: "default-character-converter",
    name: "角色卡转换器",
    description: "将任何非结构化人设段落/表格转换为一键复制的标准 Markdown",
    avatar: "🎭",
    systemPrompt: "你是一个顶级的小说创作助手和结构化数据提取专家。你的唯一任务是接收用户输入的任何非结构化、排版混乱的角色描述文本，将其提取、规范化为符合以下标准格式的 Markdown 代码块。\n\n## 格式规范\n\n对于提取出的每一个人物，请直接输出符合以下结构的 Markdown 代码块：\n\n```markdown\n---\ntier: major  # 角色等级：根据输入文本中的“角色定位”或重要性判断。主要角色为 \"major\"，次要角色/普通配角为 \"minor\"。如果无法确定，默认 \"major\"。\nname: 姓名  # 移除任何修饰词、序号、属性括号，只保留干净的人名。例如：\"1. 林墨（主角）\" 转换为 \"林墨\"。\n---\n## Core_Tags\n标签1, 标签2, 标签3  # 核心性格/职业/身份标签列表，最多 5 个标签，用英文逗号分隔。\n\n## Contrast_Detail\n矛盾细节与立体反差维度设计（例如：\"外表温和克制，面对真相时偏执狂热，容易忽视身边人的安全。父亲因秘密激活能量碎片殉职，心怀负罪感。\"）。从性格缺点、秘密、冲突中概括。\n\n## Back_Story\n背景故事与生平小传...\n\n## Relationship_Network\n- 与角色A：关系描述1\n- 与角色B：关系描述2\n```\n\n如果文本中包含多个人物，请使用 `---` 分割线将他们隔开。\n\n## 转换步骤\n1. **判断角色等级 (tier)**：仔细查找输入文本中是否包含“角色定位”或者类似的等级信息（如主角/核心配角/主要角色 -> major，次要角色/配角/龙套 -> minor）。\n2. **清洗姓名**：提取干净的名字作为 frontmatter 的 `name` 属性。\n3. **分析与清洗人际关系**：在 `Relationship_Network` 中提取该角色与提及的所有其他角色之间的关系。**关联的角色姓名必须是干净的纯姓名**。必须剥离任何前缀（如“与”、“对”、“和”）以及小括号、中括号等身份备注。例如，输出为 `- 与苏晴：关系描述`，而不是 `- 与苏晴 (闺蜜)：关系描述`。\n4. **矛盾反差**：将人物的内在冲突、心理阴影或反差设计提炼到 `Contrast_Detail` 中。\n5. **背景故事**：将生平、核心动机等提炼到 `Back_Story` 中。\n6. **只输出标准格式**：你的回答应该仅包含符合上述要求的 Markdown 代码块，不要有任何前导或后继的客套话。确保代码块在页面中可以通过右上角的一键复制按钮被完整复制。",
    modelId: "",
    provider: "",
    allowedTools: ["read", "grep", "find", "ls", "edit", "write"],
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
    const parsed = JSON.parse(data) as GemProfile[];

    // Auto-upgrade/migration logic for defaults
    let modified = false;
    const upgraded = parsed.map((gem) => {
      const defaultGem = DEFAULT_GEMS.find((d) => d.id === gem.id);
      if (defaultGem) {
        const needsToolsUpgrade = !gem.allowedTools || gem.allowedTools.length === 0;
        const isOldPrompt = gem.systemPrompt.includes("我已经为您完成了这一章节的润色与修改") ||
                            (gem.id === "default-outline-planner" && gem.systemPrompt.includes("另存为新版本")) ||
                            (gem.id === "default-character-smith" && gem.systemPrompt.includes("另存为新版本")) ||
                            (gem.id === "default-character-converter" && !gem.systemPrompt.includes("分析与清洗人际关系"));

        if (needsToolsUpgrade || isOldPrompt) {
          modified = true;
          return {
            ...gem,
            systemPrompt: isOldPrompt ? defaultGem.systemPrompt : gem.systemPrompt,
            allowedTools: needsToolsUpgrade ? defaultGem.allowedTools : gem.allowedTools,
            modified: new Date().toISOString()
          };
        }
      }
      return gem;
    });

    // Ensure all DEFAULT_GEMS are present in the list
    const missingGems = DEFAULT_GEMS.filter(d => !upgraded.some(g => g.id === d.id));
    if (missingGems.length > 0) {
      upgraded.push(...missingGems);
      modified = true;
    }

    if (modified) {
      try {
        writeGems(upgraded);
      } catch (e) {
        console.error("Failed to write upgraded gems:", e);
      }
      return upgraded;
    }

    return parsed;
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
