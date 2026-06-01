# Implementation Plan: ink-xY Novel Studio & Local InkOS Deep Integration

This document outlines the detailed architectural blueprints, API designs, and UI hookups required to deeply merge the newly migrated local **InkOS Multi-Agent Novel Engine** (`E:\ink-xY\inkos\`) into the **ink-xY Novel Studio** desktop interface (`E:\ink-xY`).

This integration transforms the application from a generic file editor/chat setup into a premium, state-of-the-art **Non-Linear Literary IDE**, natively running offline multi-agent pipelines (planning, composing, auditing, revising) directly from the writing canvas.

---

## 🛠️ User Review Required

> [!IMPORTANT]
> **1. Unified InkOS Command REST API (`/api/inkos`)**:
> - We will create a generic backend API route at [route.ts](file:///E:/ink-xY/app/api/inkos/route.ts) that wraps the `runInkos` runner. This allows the React frontend to trigger any InkOS CLI commands (e.g. `init`, `book create`, `write next`, `audit`, `snapshot`) securely and asynchronously.
>
> **2. Workspace Auto-Initialization Banner**:
> - If a selected folder is empty or not yet initialized as an InkOS workspace (checked by scanning for `.inkos` or `story/` directories), a gorgeous Zen-style banner will prompt: *"✒️ 检测到该目录尚未初始化为小说工作区。是否一键开启您的创作宇宙？ [一键初始化]"*.
> - Clicking it automatically runs `inkos init` inside the selected folder.
>
> **3. Literary Canvas Contextual Actions (Zen Editor Toolbar)**:
> - In `FileViewer.tsx`, we will mount custom actions on the editor toolbar:
>   - **`🔍 人设防崩审计 (Run Character Audit)`**: Runs `inkos audit` on the active chapter, generating a comprehensive lore-consistency and character-compliance report, shown in a premium overlay.
>   - **`📝 规划本章意图 (Plan Chapter)`**: Runs `inkos plan` to pre-generate chapter goals and intent files.
>   - **`⚡ 一键快照备份 (Save Story Snapshot)`**: Runs `inkos snapshot` to backup state and create A/B branching points.
>
> **4. Truth System Context Injector (Character / World Lore Protection)**:
> - To fulfill the PRD's **"人设防崩系统"**, the right-side co-writer Gems will silently resolve and load all Markdown files under `角色设定/` and `世界观设定/` during chat turns, appending them to the system context to safeguard against character drift or plot contradictions.

---

## 📋 Open Questions

> [!NOTE]
> **API Authentication Sync**:
> - The local `inkos` compiled CLI requires LLM API keys and model parameters to perform its automated planning and auditing.
> - We suggest dynamically reading settings from the isolated `~/.ink/agent/models.json` (used by the Next.js UI) and passing them as environment variables (`BASE_URL`, `OPENAI_API_KEY`, `PROVIDER`) directly when invoking the `runInkos` process executor in `lib/npx.ts`. This ensures a seamless "single configuration" experience!

---

## 📦 Proposed Changes

### Component 1: Next.js API Engine
#### [NEW] [route.ts](file:///E:/ink-xY/app/api/inkos/route.ts)
- Create `/api/inkos` endpoint to safely handle InkOS executions.
- Parse actions: `init`, `book-create`, `write-next`, `audit`, `status`, `snapshot`, `custom`.
- Inject current model/key environments from UI configurations into the child process.

#### [MODIFY] [npx.ts](file:///E:/ink-xY/lib/npx.ts)
- Update `runInkos` helper to read and merge isolated UI settings from `~/.ink/agent/models.json` into the process environment variables when launching.

---

### Component 2: Frontend Layout & Zen Editor
#### [MODIFY] [FileViewer.tsx](file:///E:/ink-xY/components/FileViewer.tsx)
- Embed **"人设防崩审计"** and **"本章意图规划"** buttons onto the Zen Writing Editor toolbar.
- Implement an audit report modal or slide-over drawer that displays the Markdown-rendered analysis results returned by `/api/inkos` (with beautiful styling matching the Paper Beige theme).
- Add a smooth saving indicator that includes snapshot status.

#### [MODIFY] [SessionSidebar.tsx](file:///E:/ink-xY/components/SessionSidebar.tsx)
- Add a detection hook: when `selectedCwd` is updated, scan the root directory. If no InkOS signature is present, display the premium **"一键开启创作宇宙"** initialization card at the top of the file explorer tree.
- Clicking the card invokes `/api/inkos` to execute `init`, then refreshes the directory listing.

---

### Component 3: Truth System Context Hook
#### [MODIFY] [rpc-manager.ts](file:///E:/ink-xY/lib/rpc-manager.ts)
- Before executing AI prompts, check if the current `cwd` contains `角色设定/` and `世界观设定/` directories.
- Automatically compile and append descriptions from all `.md` files in these folders as a `[LORE CONTEXT]` block to the system instructions, ensuring the right-side chat window Gems are fully aware of character cards and lore guidelines.

---

## 🧪 Verification Plan

### Automated / Integration Checks
1. Select an empty directory `E:\ink-test-novel` as the workspace in the sidebar.
2. Verify that the **Workspace Auto-Initialization Banner** appears.
3. Click "一键初始化" and verify that `story/`, `books/`, `genres/`, `shorts/` folders are created and listed immediately in the explorer tree.
4. Create a draft chapter (e.g. `章节草稿/第一章 序幕.md`) and type text.
5. Click **"🔍 人设防崩审计"** on the editor toolbar.
6. Verify that the local multi-agent audit CLI runs successfully and displays a structured consistency report (detailing characters, world facts, and writing flaws).
7. Speak to the right-side `人设雕琢师` Gem and verify that it respects character descriptions defined under `角色设定/`.
