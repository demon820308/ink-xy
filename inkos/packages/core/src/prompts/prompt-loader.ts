import { join } from "node:path";
import { readFileSync } from "node:fs";
import { getBuiltinGenresDir } from "../agents/rules-reader.js";

export class PromptLoader {
  /**
   * Return the path to the prompts template directory inside the genres dir.
   */
  static getPromptsDir(): string {
    const genresDir = getBuiltinGenresDir();
    return join(genresDir, "prompts");
  }

  /**
   * Directly read a prompt template without fallback.
   * Throws an error if the file cannot be read.
   */
  static loadRequiredPrompt(filename: string): string {
    const promptsDir = this.getPromptsDir();
    const filePath = join(promptsDir, filename);
    return readFileSync(filePath, "utf-8");
  }
}
