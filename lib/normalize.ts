import type { AgentMessage, AssistantMessage, ToolCallContent } from "./types";

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function normalizeToolCallBlock(block: unknown): ToolCallContent | null {
  if (!isObject(block) || block.type !== "toolCall") return null;
  return {
    type: "toolCall",
    toolCallId: typeof block.toolCallId === "string" ? block.toolCallId : (typeof block.id === "string" ? block.id : ""),
    toolName: typeof block.toolName === "string" ? block.toolName : (typeof block.name === "string" ? block.name : ""),
    input: typeof block.input === "object" && block.input !== null && !Array.isArray(block.input)
      ? block.input as Record<string, unknown>
      : (typeof block.arguments === "object" && block.arguments !== null && !Array.isArray(block.arguments)
        ? block.arguments as Record<string, unknown>
        : {}),
  };
}

function parseThinkingBlocks(blocks: any[]): any[] {
  if (!Array.isArray(blocks)) return blocks;
  const result: any[] = [];

  for (const block of blocks) {
    if (block && block.type === "text" && typeof block.text === "string") {
      const text = block.text;

      // Check for <think> tag
      const thinkStartIdx = text.indexOf("<think>");
      if (thinkStartIdx !== -1) {
        const thinkContentStart = thinkStartIdx + 7; // Length of "<think>" is 7
        const thinkEndIdx = text.indexOf("</think>", thinkContentStart);

        if (thinkEndIdx !== -1) {
          // Closed <think> tag found
          const thinkingText = text.substring(thinkContentStart, thinkEndIdx);
          const afterText = text.substring(thinkEndIdx + 8); // Length of "</think>" is 8

          if (thinkStartIdx > 0) {
            const beforeText = text.substring(0, thinkStartIdx);
            result.push({ type: "text", text: beforeText });
          }

          result.push({ type: "thinking", thinking: thinkingText });

          if (afterText) {
            // Recursively parse the rest
            const rest = parseThinkingBlocks([{ type: "text", text: afterText }]);
            result.push(...rest);
          }
        } else {
          // Unclosed <think> tag (still streaming or cut off)
          const thinkingText = text.substring(thinkContentStart);

          if (thinkStartIdx > 0) {
            const beforeText = text.substring(0, thinkStartIdx);
            result.push({ type: "text", text: beforeText });
          }

          result.push({ type: "thinking", thinking: thinkingText });
        }
      } else {
        result.push(block);
      }
    } else {
      result.push(block);
    }
  }
  return result;
}

export function normalizeToolCalls(msg: AgentMessage): AgentMessage {
  if (msg.role !== "assistant") return msg;
  const content = (msg as AssistantMessage).content;
  if (!Array.isArray(content)) return msg;
  const normalized = content.map((block) => {
    const result = normalizeToolCallBlock(block);
    return result ?? block;
  });
  const parsedContent = parseThinkingBlocks(normalized);
  return { ...msg, content: parsedContent } as AgentMessage;
}