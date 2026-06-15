import { PromptLoader } from "./prompt-loader.js";

export interface ShortFictionReferencePromptInput {
  readonly text?: string;
}

export interface ShortFictionOutlinePromptInput {
  readonly direction: string;
  readonly chapterCount: number;
  readonly charsPerChapter: number;
  readonly reference?: ShortFictionReferencePromptInput;
}

export interface ShortFictionOutlineReviewPromptInput {
  readonly direction: string;
  readonly outline: {
    readonly rawContent: string;
  };
  readonly reference?: ShortFictionReferencePromptInput;
}

export interface ShortFictionOutlineRevisionPromptInput extends ShortFictionOutlineReviewPromptInput {
  readonly review: string;
  readonly chapterCount: number;
  readonly charsPerChapter: number;
}

export interface ShortFictionDraftPromptInput {
  readonly direction: string;
  readonly outlineMarkdown: string;
  readonly chapterCount: number;
  readonly charsPerChapter: number;
}

export interface ShortFictionDraftReviewPromptInput extends ShortFictionDraftPromptInput {
  readonly draftMarkdown: string;
}

export interface ShortFictionDraftRevisionPromptInput extends ShortFictionDraftPromptInput {
  readonly review: string;
}

export interface ShortFictionPackagePromptInput {
  readonly direction: string;
  readonly outlineMarkdown: string;
  readonly draftMarkdown: string;
  readonly draftTitle: string;
}

export function buildShortFictionOutlineSystemPrompt(): string {
  return PromptLoader.loadRequiredPrompt("short_fiction/sf_outline_system.md");
}

export function buildShortFictionOutlineUserPrompt(input: ShortFictionOutlinePromptInput): string {
  const template = PromptLoader.loadRequiredPrompt("short_fiction/sf_outline_user.md");
  const referenceBlock = input.reference?.text
    ? "## 可选参考文本\n" + trimForPrompt(input.reference.text, 12000) + "\n"
    : "";
  return template
    .replaceAll("{{direction}}", input.direction)
    .replaceAll("{{chapterCount}}", String(input.chapterCount))
    .replaceAll("{{charsPerChapter}}", String(input.charsPerChapter))
    .replaceAll("{{referenceBlock}}", referenceBlock);
}

export function buildShortFictionOutlineReviewSystemPrompt(): string {
  return PromptLoader.loadRequiredPrompt("short_fiction/sf_outline_review_system.md");
}

export function buildShortFictionOutlineReviewUserPrompt(input: ShortFictionOutlineReviewPromptInput): string {
  const template = PromptLoader.loadRequiredPrompt("short_fiction/sf_outline_review_user.md");
  const referenceBlock = input.reference?.text
    ? "## 可选参考文本\n" + trimForPrompt(input.reference.text, 8000) + "\n"
    : "";
  return template
    .replaceAll("{{direction}}", input.direction)
    .replaceAll("{{referenceBlock}}", referenceBlock)
    .replaceAll("{{outline}}", input.outline.rawContent);
}

export function buildShortFictionOutlineRevisionFollowup(input: ShortFictionOutlineRevisionPromptInput): string {
  const template = PromptLoader.loadRequiredPrompt("short_fiction/sf_outline_revision_followup.md");
  return template
    .replaceAll("{{chapterCount}}", String(input.chapterCount))
    .replaceAll("{{charsPerChapter}}", String(input.charsPerChapter))
    .replaceAll("{{review}}", input.review.trim());
}

export function buildShortFictionWriterSystemPrompt(): string {
  return PromptLoader.loadRequiredPrompt("short_fiction/sf_writer_system.md");
}

export function buildShortFictionWriterUserPrompt(input: ShortFictionDraftPromptInput): string {
  const template = PromptLoader.loadRequiredPrompt("short_fiction/sf_writer_user.md");
  const chaptersFormatBlock = Array.from({ length: input.chapterCount }, (_, index) => {
    const chapter = index + 1;
    return [
      `=== CHAPTER ${chapter} TITLE ===`,
      "章节标题，只写纯文本，不要 #，不要第几章前缀",
      `=== CHAPTER ${chapter} CONTENT ===`,
      `第${chapter}章正文，写完整场面，不要梗概，不要作者备注`,
    ].join("\n");
  }).join("\n");

  return template
    .replaceAll("{{chapterCount}}", String(input.chapterCount))
    .replaceAll("{{charsPerChapter}}", String(input.charsPerChapter))
    .replaceAll("{{direction}}", input.direction)
    .replaceAll("{{outlineMarkdown}}", input.outlineMarkdown)
    .replaceAll("{{chaptersFormatBlock}}", chaptersFormatBlock);
}

export function buildShortFictionDraftReviewSystemPrompt(): string {
  return PromptLoader.loadRequiredPrompt("short_fiction/sf_draft_review_system.md");
}

export function buildShortFictionDraftReviewUserPrompt(input: ShortFictionDraftReviewPromptInput): string {
  const template = PromptLoader.loadRequiredPrompt("short_fiction/sf_draft_review_user.md");
  return template
    .replaceAll("{{direction}}", input.direction)
    .replaceAll("{{outlineMarkdown}}", input.outlineMarkdown)
    .replaceAll("{{draftMarkdown}}", input.draftMarkdown);
}

export function buildShortFictionDraftRevisionFollowup(input: ShortFictionDraftRevisionPromptInput): string {
  const template = PromptLoader.loadRequiredPrompt("short_fiction/sf_draft_revision_followup.md");
  const chaptersFormatBlock = Array.from({ length: input.chapterCount }, (_, index) => {
    const chapter = index + 1;
    return [
      `=== CHAPTER ${chapter} TITLE ===`,
      "章节标题，只写纯文本，不要 #，不要第几章前缀",
      `=== CHAPTER ${chapter} CONTENT ===`,
      `第${chapter}章正文，写完整场面，不要梗概，不要作者备注`,
    ].join("\n");
  }).join("\n");

  return template
    .replaceAll("{{review}}", input.review.trim())
    .replaceAll("{{chaptersFormatBlock}}", chaptersFormatBlock);
}

export function buildShortFictionPackageSystemPrompt(): string {
  return PromptLoader.loadRequiredPrompt("short_fiction/sf_package_system.md");
}

export function buildShortFictionPackageUserPrompt(input: ShortFictionPackagePromptInput): string {
  const template = PromptLoader.loadRequiredPrompt("short_fiction/sf_package_user.md");
  return template
    .replaceAll("{{direction}}", input.direction)
    .replaceAll("{{outlineMarkdown}}", trimForPrompt(input.outlineMarkdown, 6000))
    .replaceAll("{{draftMarkdown}}", trimForPrompt(input.draftMarkdown, 16000))
    .replaceAll("{{draftTitle}}", input.draftTitle);
}

function trimForPrompt(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n\n……（已截断）`;
}
