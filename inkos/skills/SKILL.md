---
name: inkos
description: Autonomous novel writing engine (InkOS Core) integrated as an in-process library and Next.js REST API. Supports creative fiction writing, standalone short-fiction packages, cover generation, style imitation, chapter continuation/import, EPUB export, AIGC detection, and fan fiction. Native English support with 10 built-in English genre profiles. Multi-agent pipeline with 33-dimension auditing, creative brief input, and structured logging.
version: 2.3.4
metadata: { "openclaw": { "emoji": "📖", "requires": { "bins": ["node"], "env": ["OPENAI_API_KEY"] }, "primaryEnv": "OPENAI_API_KEY", "homepage": "https://github.com/Narcooo/inkos" } }
---

# InkOS - In-Process Autonomous Novel Writing Engine

InkOS is an autonomous fiction writing system powered by LLM agents. It has been refactored from a spawned CLI process into an **in-process library (`@actalk/inkos-core`)** and a **Next.js REST API endpoint (`/api/inkos`)**. It orchestrates a multi-agent pipeline (Radar → Planner → Composer → Architect → Writer → Observer → Reflector → Normalizer → Auditor → Reviser) to generate, audit, and revise novel content programmatically.

---

## 1. Skill Execution Interface

This skill can be executed directly by running the Node.js script `node ./inkos/skills/scripts/index.js <action> [options]`.
For example:
- **Status check**: `node ./inkos/skills/scripts/index.js status --cwd .`
- **Create a book**: `node ./inkos/skills/scripts/index.js book-create --title "My Novel" --genre xuanhuan --cwd .`
- **Write next chapter**: `node ./inkos/skills/scripts/index.js write-next --bookId my-book-id --cwd .`

Arguments can be passed as standard flags (`--key val`) or as a JSON string (e.g. `node ./inkos/skills/scripts/index.js write-next '{"bookId": "my-book"}' --cwd .`).

---

## 2. REST API Endpoint (`/api/inkos`)

The Next.js host also exposes a unified REST API endpoint:
- **URL**: `POST /api/inkos`
- **Headers**: `Content-Type: application/json`
- **Body**: `{ "action": string, "args": Record<string, any> }`
- **Response**: A stream of `application/x-ndjson` (Newlined JSON objects) for streaming/long-running operations, or a standard JSON response for synchronous operations.

---

## 3. Actions Reference

Here is the specification of the supported actions.

### 2.1 Project Initialization & Status
- **`init`**: Initialize an InkOS project directory structure.
  - **Args**: `{ "language": "zh" | "en" }`
  - **In-process equivalent**: Writes configuration file (`inkos.json`), support files (`.env`, `.nvmrc`, `.node-version`, `.gitignore`), and sets up empty directories (`books`, `radar`).
- **`status`**: Check the configuration and listing of books in the project.
  - **Args**: None
  - **In-process equivalent**: `loadProjectConfig(cwd)` + `StateManager.listBooks()`
- **`dashboard`**: Aggregates dashboard-level statistics and metadata.
  - **Args**: None

### 2.2 Book Management
- **`book-create`**: Create a new book config and default files.
  - **Args**: 
    - `title`: String (Required)
    - `genre`: String (e.g. `litrpg`, `xuanhuan`, etc. Required)
    - `words`: Number (Chapter word count target. Defaults to 3000)
    - `brief`: String (Optional path to a markdown creative brief)
    - `lang`: `"zh"` | `"en"` (Optional)
    - `platform`: String (Optional platform target)
  - **In-process equivalent**: `deriveBookIdFromTitle` + `ArchitectAgent.initializeBook()`
- **`book-delete`**: Delete a book and all its associated chapters and truth state files.
  - **Args**: `{ "bookId": string }`
  - **In-process equivalent**: `StateManager.deleteBook(bookId)`
- **`book-list`**: List all books in the project workspace. (Handled via `status` and `dashboard`).

### 2.3 Core Pipeline (Writing & Correction)
- **`write-next`**: Runs the full autonomous pipeline (plan → draft → audit → revise → commit).
  - **Args**:
    - `bookId`: String (Optional if only one book exists)
    - `activeChapter`: Number (Optional active chapter index to write after)
    - `words`: Number (Optional word count override)
    - `forceRewrite`: Boolean (Optional; if true, roll back and overwrite existing chapters from target onwards)
  - **In-process equivalent**: `PipelineRunner.writeNextChapter(bookId, wordCount)`
  - **Streaming Events**: Emits NDJSON `{ "type": "stdout", "data": string }` progress and details, ending with `{ "type": "result", "success": boolean, ... }`.
- **`draft`**: Generate a creative draft without running audits or auto-revisions.
  - **Args**:
    - `bookId`: String
    - `context`: String (Optional chapter-level direction guidance)
    - `words`: Number (Optional word count target)
  - **In-process equivalent**: `PipelineRunner.writeDraft(bookId, context, wordCount)`
- **`revise`**: Manually trigger revision/polishing on a drafted chapter.
  - **Args**:
    - `bookId`: String
    - `chapter`: Number (Chapter number to revise)
    - `mode`: `"polish"` | `"spot-fix"` | `"rewrite"` | `"rework"` | `"anti-detect"` (Optional; defaults to `"auto"`)
    - `context`: String (Optional guidance context)
  - **In-process equivalent**: `PipelineRunner.reviseChapter(bookId, chapter, mode, context)`
- **`audit`**: Perform a standalone 33-dimension quality check on a chapter.
  - **Args**:
    - `bookId`: String
    - `chapter`: Number
  - **In-process equivalent**: `ContinuityAuditor.audit(bookId, chapter)`
- **`write-sync`**: Synchronize memory databases and project indexes with edited chapter prose files on disk.
  - **Args**: `{ "bookId": string }`
  - **In-process equivalent**: `PipelineRunner.syncChapters(bookId)`

### 2.4 Control & Steering (Input Governance)
- **`plan`**: Generate outline intent for the next chapter.
  - **Args**: `{ "bookId": string, "guidance": string }`
  - **In-process equivalent**: `PipelineRunner.planChapter(bookId, guidance)`
- **`compose`**: Build the governed writer context package for the next chapter.
  - **Args**: `{ "bookId": string, "guidance": string }`
  - **In-process equivalent**: `composeGovernedChapter(bookId, guidance)`
- **`consolidate`**: Condense long chapter summaries to fit context windows.
  - **Args**: `{ "bookId": string }`
  - **In-process equivalent**: `ConsolidatorAgent.consolidate(bookDir)`
- **`review-approve`**: Approve a drafted chapter and commit its state changes to the story bible.
  - **Args**: `{ "bookId": string, "chapter": number }`
  - **In-process equivalent**: `StateManager.commitChapter(bookId, chapter)`
- **`review-reject`**: Discard a drafted chapter and roll back state files.
  - **Args**: `{ "bookId": string, "chapter": number }`
  - **In-process equivalent**: `StateManager.rollbackToChapter(bookId, chapter - 1)`

### 2.5 Style & Canon
- **`style-import`**: Analyze a reference text file and import its stylistic properties as a style guide profile.
  - **Args**: 
    - `bookId`: String
    - `from`: String (Path to reference text file)
    - `name`: String (Optional style profile name)
  - **In-process equivalent**: `analyzeStyle(text, name)` and save to `story/styles/`
- **`style-list`**: List all style guide profiles available for the book.
  - **Args**: `{ "bookId": string }`
- **`style-switch`**: Switch the active style guide of a book.
  - **Args**: `{ "bookId": string, "name": string }`
- **`import-canon`**: Link a spinoff book to a parent book's world bible.
  - **Args**: `{ "bookId": string, "from": string }` (where `from` is the parent `bookId`)
  - **In-process equivalent**: `PipelineRunner.importCanon(bookId, parentBookId)`
- **`import-chapters`**: Import existing text chapters and reverse-engineer truth state files.
  - **Args**:
    - `bookId`: String
    - `from`: String (Path to text file or directory)
    - `split`: String (Optional regex pattern to split chapters)
    - `resumeFrom`: Number (Optional chapter to resume import from)
    - `series`: Boolean (Optional; if true, import in "series" mode)
  - **In-process equivalent**: Reads files and calls `PipelineRunner.importChapters({ bookId, chapters, resumeFrom, importMode })`

### 2.6 Analytics, Detection, & Extras
- **`radar-scan`**: Run trend radar scan on platform novels.
  - **Args**: None
  - **In-process equivalent**: `RadarAgent.scan()`
- **`aigc-detect`**: Detect AI-generated content traces inside chapters.
  - **Args**:
    - `bookId`: String
    - `chapter`: Number (Optional; defaults to the latest chapter)
    - `all`: Boolean (Optional; scan all chapters if true)
    - `stats`: Boolean (Optional; return history insights if true)
  - **In-process equivalent**: `detectChapter(config, content, chapter, pipeline)` or `loadDetectionHistory(bookDir)`
- **`short-run`**: Run a complete short-fiction package generation.
  - **Args**:
    - `direction`: String (Creative description / direction. Required)
    - `chapters`: Number (Required)
    - `chars`: Number (Required)
    - `storyId`: String (Optional)
    - `outDir`: String (Optional; defaults to `shorts`)
    - `cover`: Boolean (Optional)
  - **In-process equivalent**: `runShortFictionProduction(options)`
- **`fanfic-init`**: Create a fan-fiction book from a source text file.
  - **Args**:
    - `title`: String
    - `from`: String (Source text file path)
    - `mode`: `"canon"` | `"au"` | `"ooc"` | `"cp"`
    - `genre`: String
  - **In-process equivalent**: `FanficCanonImporter.import()`
- **`fanfic-refresh`**: Re-import source text and refresh fan-fiction canon files.
  - **Args**: `{ "bookId": string, "from": string }`
  - **In-process equivalent**: `FanficCanonImporter.refresh()`
- **`export`**: Compile and export a book.
  - **Args**:
    - `bookId`: String
    - `format`: `"txt"` | `"md"` | `"epub"` (Optional; defaults to `"epub"`)
  - **In-process equivalent**: `writeExportArtifact(bookId, format)`

---

## 4. Programmatic API Usage (`@actalk/inkos-core`)

If you are developing a Node-based host application, you can call the core library APIs directly:

```typescript
import { PipelineRunner, StateManager, loadProjectConfig, createLLMClient } from "@actalk/inkos-core";

const projectRoot = "/path/to/my-writing-project";

// 1. Load project configurations
const config = await loadProjectConfig(projectRoot);

// 2. Setup LLM client and instanciate PipelineRunner
const pipeline = new PipelineRunner({
  client: createLLMClient(config.llm),
  model: config.llm.model,
  projectRoot: projectRoot,
  defaultLLMConfig: config.llm,
  onStreamProgress: (progress) => {
    console.log(`Writing chapter: elapsed ${progress.elapsedMs}ms, ${progress.totalChars} chars.`);
  }
});

// 3. Write next chapter
const result = await pipeline.writeNextChapter("my-book-id");
console.log("Chapter written successfully:", result.chapterNumber);
```

---

## 5. Key Design Considerations

- **Concurrency Security**: Parallel requests targeting the same book ID are automatically locked and processed sequentially using an in-memory lock manager (`withBookLock`), avoiding conflicts and state file corruption.
- **Node.js 22+ Requirement**: The library uses the native `node:sqlite` module, eliminating the need for C++ compiled native addons like `better-sqlite3`.
- **Environment Isolation**: Isolated configs (e.g. `~/.ink/agent/models.json`) are automatically mapped to process environment variables upon API route entries, maintaining credential safety without global exposure.
