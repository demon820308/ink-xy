import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { StateManager } from "../state/manager.js";
import { PipelineRunner, type ChapterPipelineResult, type PlanChapterResult, type ComposeChapterResult, type ReviseResult, type DraftResult, type InitBookOptions, type ImportChaptersInput, type ImportChaptersResult } from "../pipeline/runner.js";
import { createLLMClient } from "../llm/provider.js";
import { loadProjectConfig } from "../utils/config-loader.js";
import { createLogger } from "../utils/logger.js";
import type { BookConfig } from "../models/book.js";
import { ConsolidatorAgent } from "../agents/consolidator.js";

export interface InkOSServiceConfig {
  readonly projectRoot: string;
  readonly onProgress?: (progress: { stage: string; message: string; data?: any }) => void;
}

export class InkOSService {
  private readonly projectRoot: string;
  private readonly onProgress?: (progress: { stage: string; message: string; data?: any }) => void;
  private readonly state: StateManager;

  constructor(config: InkOSServiceConfig) {
    this.projectRoot = config.projectRoot;
    this.onProgress = config.onProgress;
    this.state = new StateManager(this.projectRoot);
  }

  private async createRunner(options: { externalContext?: string } = {}): Promise<PipelineRunner> {
    const config = await loadProjectConfig(this.projectRoot);
    const logger = createLogger({
      tag: "inkos",
      sinks: [
        {
          write: (entry) => {
            this.onProgress?.({
              stage: "log",
              message: entry.message,
              data: { level: entry.level },
            });
          },
        },
      ],
    });

    return new PipelineRunner({
      client: createLLMClient(config.llm),
      model: config.llm.model,
      projectRoot: this.projectRoot,
      defaultLLMConfig: config.llm,
      foundationReviewRetries: config.foundation.reviewRetries,
      writingReviewRetries: config.writing?.reviewRetries ?? 1,
      modelOverrides: config.modelOverrides,
      inputGovernanceMode: config.inputGovernanceMode,
      notifyChannels: config.notify,
      logger,
      onStreamProgress: (progress) => {
        this.onProgress?.({
          stage: "stream",
          message: `Streaming completion...`,
          data: progress,
        });
      },
      externalContext: options.externalContext,
    });
  }

  // 1. Project Init
  async initProject(language: "zh" | "en" = "zh"): Promise<void> {
    const projectDir = this.projectRoot;
    await mkdir(projectDir, { recursive: true });
    await mkdir(join(projectDir, "books"), { recursive: true });
    await mkdir(join(projectDir, "radar"), { recursive: true });

    const projectConfig = {
      name: "novel-project",
      version: "0.1.0",
      language,
      llm: {
        provider: "openai",
        service: "custom",
        configSource: "studio",
        baseUrl: "",
        model: "",
        apiFormat: "chat",
        stream: true,
      },
      notify: [],
      detection: {
        enabled: false,
        provider: "llm",
        threshold: 0.5,
        autoRewrite: false,
      },
      inputGovernanceMode: "v2",
      daemon: {
        schedule: {
          radarCron: "0 */6 * * *",
          writeCron: "*/15 * * * *",
        },
        maxConcurrentBooks: 3,
      },
    };

    await writeFile(join(projectDir, "inkos.json"), JSON.stringify(projectConfig, null, 2), "utf-8");
  }

  // 2. Book Creation
  async createBook(book: BookConfig, options?: InitBookOptions): Promise<void> {
    const runner = await this.createRunner({ externalContext: options?.externalContext });
    await runner.initBook(book);
  }

  // 2b. Fanfic Book Creation
  async createFanficBook(book: BookConfig, sourceText: string, sourceName: string, mode: string): Promise<void> {
    const runner = await this.createRunner();
    await runner.initFanficBook(book, sourceText, sourceName, mode as any);
  }

  // 2c. Fanfic Canon Import
  async importFanficCanon(bookId: string, sourceText: string, sourceName: string, mode: string): Promise<void> {
    const runner = await this.createRunner();
    await runner.importFanficCanon(bookId, sourceText, sourceName, mode as any);
  }

  async writeNextChapter(bookId: string, wordCount?: number, context?: string): Promise<ChapterPipelineResult> {
    const runner = await this.createRunner({ externalContext: context });
    this.onProgress?.({ stage: "pipeline_start", message: "Starting chapter write pipeline..." });
    const result = await runner.writeNextChapter(bookId, wordCount);
    this.onProgress?.({ stage: "pipeline_end", message: "Pipeline completed successfully.", data: result });
    return result;
  }

  // 4. Draft generation
  async writeDraft(bookId: string, context: string, wordCount?: number): Promise<DraftResult> {
    const runner = await this.createRunner({ externalContext: context });
    return await runner.writeDraft(bookId, context, wordCount);
  }

  // 5. Revision
  async reviseDraft(bookId: string, chapterNumber: number, mode: string, context?: string): Promise<ReviseResult> {
    const runner = await this.createRunner({ externalContext: context });
    return await runner.reviseDraft(bookId, chapterNumber, mode as any);
  }

  // 6. Audit
  async auditDraft(bookId: string, chapterNumber: number): Promise<any> {
    const runner = await this.createRunner();
    return await runner.auditDraft(bookId, chapterNumber);
  }

  // 7. Plan
  async planChapter(bookId: string, context: string): Promise<PlanChapterResult> {
    const runner = await this.createRunner({ externalContext: context });
    return await runner.planChapter(bookId, context);
  }

  // 8. Compose
  async composeChapter(bookId: string, context: string): Promise<ComposeChapterResult> {
    const runner = await this.createRunner({ externalContext: context });
    return await runner.composeChapter(bookId, context);
  }

  // 9. Sync
  async resyncChapterArtifacts(bookId: string, chapterNumber: number): Promise<void> {
    const runner = await this.createRunner();
    await runner.resyncChapterArtifacts(bookId, chapterNumber);
  }

  // 10. Consolidate
  async consolidate(bookId: string): Promise<void> {
    const config = await loadProjectConfig(this.projectRoot);
    const client = createLLMClient(config.llm);
    const consolidator = new ConsolidatorAgent({
      client,
      model: config.llm.model,
      projectRoot: this.projectRoot,
    });
    const bookDir = this.state.bookDir(bookId);
    await consolidator.consolidate(bookDir);
  }

  // 11. Import Chapters
  async importChapters(options: ImportChaptersInput): Promise<ImportChaptersResult> {
    const runner = await this.createRunner();
    return await runner.importChapters(options);
  }

  // 12. Import Canon
  async importCanon(bookId: string, fromBookId: string): Promise<any> {
    const runner = await this.createRunner();
    return await runner.importCanon(bookId, fromBookId);
  }

  // 13. Generate Style Guide
  async generateStyleGuide(bookId: string, text: string, styleName: string): Promise<void> {
    const runner = await this.createRunner();
    await runner.generateStyleGuide(bookId, text, styleName);
  }

  // 14. Radar Scan
  async runRadar(): Promise<any> {
    const runner = await this.createRunner();
    return await runner.runRadar();
  }

  // 15. AIGC Detect
  async detectChapter(detectionConfig: any, content: string, chapterNumber: number): Promise<any> {
    const config = await loadProjectConfig(this.projectRoot);
    const client = createLLMClient(config.llm);
    const { detectChapter } = await import("../pipeline/detection-runner.js");
    return await detectChapter(detectionConfig, content, chapterNumber, { client, model: config.llm.model, projectRoot: this.projectRoot });
  }
}
