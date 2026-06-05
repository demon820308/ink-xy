import "@/lib/env-init";
import { NextResponse } from "next/server";
import { AuthStorage, ModelRegistry, SettingsManager, getAgentDir } from "@earendil-works/pi-coding-agent";
import { findModel } from "../../../../lib/model-resolver";
import { writeFileSync } from "fs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { content: fileContent } = await req.json() as { content?: string };

    if (!fileContent || !fileContent.trim()) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const agentDir = getAgentDir();
    const authStorage = AuthStorage.create();
    const registry = ModelRegistry.create(authStorage);

    console.log("[parse-characters] CWD:", process.cwd());
    console.log("[parse-characters] PI_CODING_AGENT_DIR Env:", process.env.PI_CODING_AGENT_DIR);
    console.log("[parse-characters] Resolved agentDir:", agentDir);

    // 1. Resolve default provider and model from settings
    const settings = SettingsManager.create(process.cwd(), agentDir);
    let provider = settings.getDefaultProvider() || "";
    let modelId = settings.getDefaultModel() || "";
    console.log("[parse-characters] Default provider from settings:", provider);
    console.log("[parse-characters] Default modelId from settings:", modelId);

    // 2. Resolve registry entry
    let apiKey = "";
    let endpoint = "";
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    let useGoogleApi = false;

    const model = provider && modelId ? findModel(registry, provider, modelId) : undefined;
    console.log("[parse-characters] Resolved model from findModel:", model ? JSON.stringify(model) : "undefined");

    if (model) {
      const auth = await registry.getApiKeyAndHeaders(model);
      console.log("[parse-characters] Auth registry check result:", JSON.stringify(auth));
      if (!auth.ok) {
        return NextResponse.json({ error: `无法解析模型认证: ${auth.error}` }, { status: 400 });
      }

      endpoint = `${model.baseUrl}/chat/completions`;
      if (auth.apiKey) {
        apiKey = auth.apiKey;
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      if (auth.headers) {
        headers = { ...headers, ...auth.headers };
      }
      modelId = model.id;
      provider = model.provider;

      if (provider.toLowerCase() === "google" || provider.toLowerCase() === "gemini") {
        useGoogleApi = true;
      }
    } else {
      // Fallback manual resolution
      if (provider) {
        const auth = authStorage.get(provider) as { key?: string } | undefined;
        if (auth?.key) {
          apiKey = auth.key;
        } else {
          const envNames = [
            `${provider.toUpperCase()}_API_KEY`,
            `${provider.toUpperCase().replace("-", "_")}_API_KEY`
          ];
          for (const name of envNames) {
            if (process.env[name]) {
              apiKey = process.env[name]!;
              break;
            }
          }
        }
      }

      if (!apiKey) {
        // Fall back to first configured OpenAI / Anthropic key
        const openaiAuth = authStorage.get("openai") as { key?: string } | undefined;
        if (openaiAuth?.key) {
          apiKey = openaiAuth.key;
          provider = "openai";
          modelId = "gpt-4o-mini";
        } else {
          const anthropicAuth = authStorage.get("anthropic") as { key?: string } | undefined;
          if (anthropicAuth?.key) {
            apiKey = anthropicAuth.key;
            provider = "anthropic";
            modelId = "claude-3-5-sonnet-20241022";
          }
        }
      }

      if (!apiKey) {
        if (process.env.OPENAI_API_KEY) {
          apiKey = process.env.OPENAI_API_KEY;
          provider = "openai";
          modelId = "gpt-4o-mini";
        } else if (process.env.ANTHROPIC_API_KEY) {
          apiKey = process.env.ANTHROPIC_API_KEY;
          provider = "anthropic";
          modelId = "claude-3-5-sonnet-20241022";
        } else if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
          apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
          provider = "google";
          modelId = "gemini-1.5-flash";
        }
      }

      if (!apiKey) {
        return NextResponse.json({
          error: "未配置可用模型的 API 密钥。请先在侧边栏底部的 Models 中配置 API Key，或在系统环境变量中设置 OPENAI_API_KEY。"
        }, { status: 400 });
      }

      headers["Authorization"] = `Bearer ${apiKey}`;
      endpoint = "https://api.openai.com/v1/chat/completions";

      if (provider === "openrouter") {
        endpoint = "https://openrouter.ai/api/v1/chat/completions";
      } else if (provider.includes("xiaomi-token-plan") || provider.includes("mimo") || provider.includes("lingya")) {
        if (process.env.LINGYA_API_URL) {
          endpoint = `${process.env.LINGYA_API_URL}/chat/completions`;
        } else {
          endpoint = "https://token-plan.api.xiaomi.net/v1/chat/completions";
        }
      } else if (provider === "google" || provider === "gemini") {
        useGoogleApi = true;
      }
    }

    // 1. Extract all character names from headings first for cross-reference
    const nameList: string[] = [];
    const rawLines = fileContent.split("\n");
    for (const line of rawLines) {
      if (line.startsWith("##") && !/关系|一览|目录|介绍|人设总览|人设一览/i.test(line)) {
        let heading = line.replace(/^##+\s+/, "").trim();
        let name = heading.replace(/^\d+[\s.、·-]/, "").trim();
        if (name.includes("——")) {
          const parts = name.split("——").map(p => p.trim());
          const p1 = parts[0].replace(/\([^\)]+\)/g, "").replace(/（[^）]+）/g, "").replace(/['"“”]/g, "").trim();
          const p2 = parts[1].replace(/\([^\)]+\)/g, "").replace(/（[^）]+）/g, "").replace(/['"“”]/g, "").trim();
          if (p2 && p2.length < p1.length && (p1.length > 6 || /AI|计划|系统|后方/i.test(p1))) {
            name = p2;
          } else {
            name = p1;
          }
        } else if (name.includes(" - ")) {
          const parts = name.split(" - ").map(p => p.trim());
          const p1 = parts[0].replace(/\([^\)]+\)/g, "").replace(/（[^）]+）/g, "").replace(/['"“”]/g, "").trim();
          const p2 = parts[1].replace(/\([^\)]+\)/g, "").replace(/（[^）]+）/g, "").replace(/['"“”]/g, "").trim();
          if (p2 && p2.length < p1.length && (p1.length > 6 || /AI|计划|系统|后方/i.test(p1))) {
            name = p2;
          } else {
            name = p1;
          }
        } else {
          name = name.replace(/\([^\)]+\)/g, "").replace(/（[^）]+）/g, "").replace(/['"“”]/g, "").trim();
        }
        if (name && name.length >= 2 && name.length <= 15) {
          nameList.push(name);
        }
      }
    }

    console.log(`[parse-characters] Extracted ${nameList.length} character names for cross-referencing:`, nameList);

    // 2. Split fileContent into chunks of 5 characters
    const chunks = splitTextIntoChunks(fileContent, 5);
    console.log(`[parse-characters] Split input into ${chunks.length} chunks.`);

    // 3. Process each chunk sequentially with retry logic
    const characters: any[] = [];
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunkText = chunks[chunkIndex];
      const promptText = `你是一个顶级的小说创作助手和结构化数据提取专家。
请帮我把下面这段描述小说角色人设的文本，提取并解析成结构化的 JSON 数组。

输入文本包含一个或多个人物。请你完美地解析出所有人物，并填补所有必需的字段。

输出格式必须是符合以下 TypeScript 类型的 JSON 数组：
\`\`\`typescript
interface ParsedCharacter {
  name: string; // 角色姓名（例如："林墨"）
  tier: "major" | "minor"; // 角色等级："major" 代表主角或主要配角，"minor" 代表普通配角或龙套。如果无法确定，默认 "major"。
  tags: string[]; // 核心性格/职业/身份标签列表，最多 5 个标签（例如：["考古学家", "冷静", "执拗"]）
  contrast: string; // 矛盾细节与立体反差维度设计（例如："外表温和克制，面对真相时偏执狂热，容易忽视身边人的安全。父亲因秘密激活能量碎片殉职，心怀负罪感。"）。如果没有，从性格缺点、秘密、冲突中概括。
  bio: string; // 背景小传与生平经历描述。
  relationships: {
    target: string; // 关联 of another character's name (must be a clean name from the list, e.g. "苏晴")
    type: string; // relationship description (e.g. "行动哲学对立，专业上互相信任")
  }[];
}
\`\`\`

【关键提取要求】：
1. 姓名清洗：移除名字周围的任何修饰词、序号、属性括号等，只保留干净的人名（例如：把 "1. 林墨（主角）—— \"在废墟中寻找自己的人\"" 清洗为 "林墨"，把 "\"零号\"" 清洗为 "零号"）。
2. 人际关系交叉提取：提取每个人物与其他人物之间的关系。
   本小说包含的所有可能角色名单为：${JSON.stringify(nameList)}。
   如果本批角色的描述文本中提及了名单中的任何其他角色，请务必在 \`relationships\` 中建立关系条目。
3. 保持数据完整：不要遗漏任何角色，还原用户输入的所有角色信息。
4. 返回格式：必须直接返回合法的 JSON 数组，绝对不要包含 Markdown 格式的包裹（如 \`\`\`json 标记），不要有任何前导字眼，确保可以直接被 JSON.parse 解析。
5. 属性值内的双引号处理：属性值内部绝对不能包含未转义 of English double quotes ("). If the extracted text contains double quotes, please replace them with Chinese double quotes (“”) or escape them properly.
6. 属性值内的换行处理：属性值内的所有换行，必须强制使用转义的 \\n，绝对不允许在 JSON 中出现物理换行！

以下是本批待解析的输入文本：
---
${chunkText}
---`;

      let parsedChunk: any[] | null = null;
      let lastError: any = null;

      // Retry up to 3 times
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[parse-characters] Processing chunk ${chunkIndex + 1}/${chunks.length}, attempt ${attempt}...`);
          let response: Response;

          if (useGoogleApi) {
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  { parts: [{ text: promptText }] }
                ],
                generationConfig: {
                  maxOutputTokens: 4000,
                },
              }),
            });
          } else if (provider === "anthropic") {
            response = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model: modelId || "claude-3-5-sonnet-20241022",
                max_tokens: 3000,
                messages: [
                  { role: "user", content: promptText },
                ],
              }),
            });
          } else {
            response = await fetch(endpoint, {
              method: "POST",
              headers,
              body: JSON.stringify({
                model: modelId,
                messages: [
                  { role: "user", content: promptText }
                ],
                max_tokens: 3000,
              }),
            });
          }

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API returned status ${response.status}: ${errorText}`);
          }

          let contentResult = "";
          if (useGoogleApi) {
            const data = await response.json() as any;
            contentResult = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
          } else if (provider === "anthropic") {
            const data = await response.json() as any;
            contentResult = data.content?.[0]?.text?.trim() || "";
          } else {
            const data = await response.json() as any;
            contentResult = data.choices?.[0]?.message?.content?.trim() || "";
          }

          // Clean up Markdown code blocks if generated
          let cleanedText = contentResult.trim();
          if (cleanedText.startsWith("```")) {
            cleanedText = cleanedText.replace(/^```[a-zA-Z]*\n/, "");
            cleanedText = cleanedText.replace(/\n```$/, "");
            cleanedText = cleanedText.trim();
          }

          // Self-healing JSON processing
          let repairedText = cleanedText;
          try {
            repairedText = repairJsonText(cleanedText);
            repairedText = closeTruncatedJson(repairedText);
          } catch (repairErr) {
            console.warn(`[parse-characters] Chunk ${chunkIndex} JSON repair failed:`, repairErr);
          }

          const parsed = JSON.parse(repairedText);
          parsedChunk = Array.isArray(parsed) ? parsed : [];
          break; // Success, exit retry loop
        } catch (err: any) {
          console.warn(`[parse-characters] Chunk ${chunkIndex + 1} attempt ${attempt} failed:`, err.message || err);
          lastError = err;
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }
      }

      if (parsedChunk === null) {
        throw new Error(`第 ${chunkIndex + 1} 组人设解析失败: ${lastError?.message || lastError || "未知错误"}`);
      }

      characters.push(...parsedChunk);
    }
    
    return NextResponse.json({ characters });

  } catch (error: any) {
    try {
      const logMsg = `[Error] ${new Date().toISOString()}\nMessage: ${error.message}\nStack: ${error.stack}\nContext:\n- CWD: ${process.cwd()}\n- PI_CODING_AGENT_DIR: ${process.env.PI_CODING_AGENT_DIR}\n- getAgentDir(): ${getAgentDir()}\n\n`;
      writeFileSync('E:/ink-xY/api-error.log', logMsg, 'utf8');
    } catch (fsErr) {
      // ignore
    }
    console.error("Error in parse-characters API:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

function repairJsonText(jsonStr: string): string {
  let inString = false;
  let result = "";
  
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    
    if (char === '"' && jsonStr[i - 1] !== '\\') {
      const prev = jsonStr.substring(0, i).trim();
      const next = jsonStr.substring(i + 1).trim();
      
      const isStructuralPrev = prev.endsWith("{") || prev.endsWith("[") || prev.endsWith(",") || prev.endsWith(":");
      const isStructuralNext = next.startsWith("}") || next.startsWith("]") || next.startsWith(",") || next.startsWith(":");
      
      if (isStructuralPrev || isStructuralNext) {
        inString = !inString;
        result += '"';
      } else {
        result += '\\"';
      }
    } else if (char === '\n') {
      if (inString) {
        result += '\\n';
      } else {
        result += '\n';
      }
    } else if (char === '\r') {
      if (inString) {
        result += '\\r';
      } else {
        result += '\r';
      }
    } else {
      result += char;
    }
  }
  
  return result;
}

function closeTruncatedJson(repaired: string): string {
  let text = repaired.trim();
  
  // Count open/close brackets
  let openBraces = (text.match(/\{/g) || []).length;
  let closeBraces = (text.match(/\}/g) || []).length;
  let openBrackets = (text.match(/\[/g) || []).length;
  let closeBrackets = (text.match(/\]/g) || []).length;
  
  // Count unescaped quotes
  let unescapedQuotes = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"' && text[i - 1] !== '\\') {
      unescapedQuotes++;
    }
  }
  if (unescapedQuotes % 2 !== 0) {
    text += '"';
  }
  
  // Close braces
  while (openBraces > closeBraces) {
    text += '}';
    closeBraces++;
  }
  while (openBrackets > closeBrackets) {
    text += ']';
    closeBrackets++;
  }
  return text;
}

function splitTextIntoChunks(content: string, chunkSize: number = 5): string[] {
  const lines = content.split("\n");
  const sections: { heading: string; bodyLines: string[] }[] = [];
  let currentSection: { heading: string; bodyLines: string[] } | null = null;
  
  for (const line of lines) {
    if (line.startsWith("##") && !/关系|一览|目录|介绍|人设总览|人设一览/i.test(line)) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { heading: line, bodyLines: [] };
    } else {
      if (currentSection) {
        currentSection.bodyLines.push(line);
      }
    }
  }
  if (currentSection) {
    sections.push(currentSection);
  }
  
  if (sections.length === 0) {
    return [content];
  }
  
  const chunks: string[] = [];
  for (let i = 0; i < sections.length; i += chunkSize) {
    const group = sections.slice(i, i + chunkSize);
    const chunkText = group.map(s => `${s.heading}\n${s.bodyLines.join("\n")}`).join("\n\n");
    chunks.push(chunkText);
  }
  
  return chunks;
}

