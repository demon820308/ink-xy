import type { BookConfig } from "../models/book.js";
import type { GenreProfile } from "../models/genre-profile.js";
import { PromptLoader } from "../prompts/prompt-loader.js";

/**
 * Observer phase: extract ALL facts from the chapter.
 * Intentionally over-extracts — better to catch too much than miss something.
 * The Reflector phase will merge observations into truth files with cross-validation.
 */
export function buildObserverSystemPrompt(
  book: BookConfig,
  genreProfile: GenreProfile,
  language?: "zh" | "en",
): string {
  const isEnglish = (language ?? genreProfile.language) === "en";
  const filename = isEnglish ? "observer_system_en.md" : "observer_system_zh.md";
  const loadedTemplate = PromptLoader.loadRequiredPrompt(filename);

  const langPrefix = isEnglish
    ? "【LANGUAGE OVERRIDE】ALL output MUST be in English.\n\n"
    : "";

  return loadedTemplate.replaceAll("{{langPrefix}}", langPrefix);
}

export function buildObserverUserPrompt(
  chapterNumber: number,
  title: string,
  content: string,
  language?: "zh" | "en",
): string {
  const isEnglish = language === "en";
  const filename = isEnglish ? "observer_user_en.md" : "observer_user_zh.md";
  const loadedTemplate = PromptLoader.loadRequiredPrompt(filename);

  return loadedTemplate
    .replaceAll("{{chapterNumber}}", String(chapterNumber))
    .replaceAll("{{title}}", title)
    .replaceAll("{{content}}", content);
}
