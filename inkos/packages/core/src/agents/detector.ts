/**
 * AIGC detection — calls external API (GPTZero, Originality, or custom endpoint) or local rule-based/LLM model.
 * Not a BaseAgent subclass since it doesn't use the LLM provider exclusively.
 */

import type { DetectionConfig } from "../models/project.js";
import type { AgentContext } from "./base.js";
import { chatCompletion } from "../llm/provider.js";
import { analyzeAITells } from "./ai-tells.js";
import { PromptLoader } from "../prompts/prompt-loader.js";

export interface DetectionResult {
  readonly score: number; // 0-1, higher = more likely AI
  readonly provider: string;
  readonly detectedAt: string;
  readonly raw?: Record<string, unknown>;
}

/**
 * Detect AI-generated content by calling an external detection API,
 * running local rule-based analysis, or querying the default LLM.
 * Returns a normalized score between 0 (human) and 1 (AI).
 */
export async function detectAIContent(
  config: DetectionConfig,
  content: string,
  ctx?: AgentContext,
): Promise<DetectionResult> {
  const detectedAt = new Date().toISOString();

  switch (config.provider) {
    case "gptzero": {
      const apiKey = getApiKey(config);
      return detectGPTZero(config.apiUrl || "https://api.gptzero.me/v2/predict/text", apiKey, content, detectedAt);
    }
    case "originality": {
      const apiKey = getApiKey(config);
      return detectOriginality(config.apiUrl || "https://api.originality.ai/api/v1/scan/ai", apiKey, content, detectedAt);
    }
    case "custom": {
      const apiKey = getApiKey(config);
      return detectCustom(config.apiUrl || "", apiKey, content, detectedAt);
    }
    case "local":
      return detectLocal(content, detectedAt);
    case "llm":
      if (!ctx) {
        throw new Error("AIGC detection using LLM provider requires an AgentContext.");
      }
      return detectLLM(ctx, content, detectedAt);
  }
}

function getApiKey(config: DetectionConfig): string {
  const keyName = config.apiKeyEnv || "DETECTION_API_KEY";
  const apiKey = process.env[keyName];
  if (!apiKey) {
    throw new Error(
      `Detection API key not found. Set ${keyName} in your environment.`,
    );
  }
  return apiKey;
}

async function detectGPTZero(
  apiUrl: string,
  apiKey: string,
  content: string,
  detectedAt: string,
): Promise<DetectionResult> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({ document: content }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GPTZero API failed: ${response.status} ${body}`);
  }

  const data = await response.json() as Record<string, unknown>;
  const documents = data.documents as Array<Record<string, unknown>> | undefined;
  const score = documents?.[0]?.completely_generated_prob as number ?? 0;

  return { score, provider: "gptzero", detectedAt, raw: data };
}

async function detectOriginality(
  apiUrl: string,
  apiKey: string,
  content: string,
  detectedAt: string,
): Promise<DetectionResult> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Originality API failed: ${response.status} ${body}`);
  }

  const data = await response.json() as Record<string, unknown>;
  const score = (data.score as Record<string, unknown>)?.ai as number ?? 0;

  return { score, provider: "originality", detectedAt, raw: data };
}

async function detectCustom(
  apiUrl: string,
  apiKey: string,
  content: string,
  detectedAt: string,
): Promise<DetectionResult> {
  if (!apiUrl) {
    throw new Error("Detection API URL (apiUrl) must be configured for custom provider.");
  }
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Detection API failed: ${response.status} ${body}`);
  }

  const data = await response.json() as Record<string, unknown>;
  const score = typeof data.score === "number" ? data.score : 0;

  return { score, provider: "custom", detectedAt, raw: data };
}

function detectLocal(
  content: string,
  detectedAt: string,
): DetectionResult {
  const result = analyzeAITells(content, "zh");
  const warnings = result.issues.filter(i => i.severity === "warning");
  const infos = result.issues.filter(i => i.severity === "info");

  // Base score 0.05, +0.25 per warning, +0.10 per info, max 0.95
  let score = 0.05 + warnings.length * 0.25 + infos.length * 0.10;
  score = Math.min(0.95, score);

  return {
    score,
    provider: "local",
    detectedAt,
    raw: { ...result, score },
  };
}

async function detectLLM(
  ctx: AgentContext,
  content: string,
  detectedAt: string,
): Promise<DetectionResult> {
  const isEnglish = /[a-zA-Z]{4,}/.test(content.slice(0, 500)) && (content.match(/\s/g) || []).length > 10;
  const templateName = isEnglish ? "detector_system_en.md" : "detector_system_zh.md";
  const loadedPrompt = PromptLoader.loadRequiredPrompt(templateName);
  const prompt = loadedPrompt.replace("{{content}}", content);

  const response = await chatCompletion(ctx.client, ctx.model, [
    { role: "user", content: prompt }
  ], { temperature: 0.3 });

  let score = 0.5;
  let raw: any = {};
  try {
    const text = response.content.trim();
    const jsonStr = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    const data = JSON.parse(jsonStr);
    score = typeof data.score === "number" ? data.score : 0.5;
    raw = data;
  } catch (e) {
    ctx.logger?.warn(`[detector] Failed to parse LLM response as JSON: ${e}. Response was: ${response.content}`);
    const match = response.content.match(/score["'\s:]+(\d+\.\d+|\d+)/i);
    if (match && match[1]) {
      score = parseFloat(match[1]);
    }
  }

  return {
    score,
    provider: `llm (${ctx.model})`,
    detectedAt,
    raw,
  };
}

