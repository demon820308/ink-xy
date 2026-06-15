import type { BookConfig } from "../models/book.js";
import type { GenreProfile } from "../models/genre-profile.js";
import type { BookRules } from "../models/book-rules.js";
import { PromptLoader } from "../prompts/prompt-loader.js";

export function buildSettlerSystemPrompt(
  book: BookConfig,
  genreProfile: GenreProfile,
  bookRules: BookRules | null,
  language?: "zh" | "en",
): string {
  const resolvedLang = language ?? genreProfile.language;
  const isEnglish = resolvedLang === "en";

  const filename = isEnglish ? "settler_system_en.md" : "settler_system_zh.md";
  const loadedTemplate = PromptLoader.loadRequiredPrompt(filename);

  const numericalBlock = genreProfile.numericalSystem
    ? (isEnglish
      ? `\n- This genre tracks numerical/resources systems; UPDATED_LEDGER must capture every resource change shown in the chapter.\n- Numerical verification law: beginning + increment = ending. These three values must be consistent.`
      : `\n- 本题材有数值/资源体系，你必须在 UPDATED_LEDGER 中追踪正文中出现的所有资源变动\n- 数值验算铁律：期初 + 增量 = 期末，三项必须可验算`)
    : (isEnglish
      ? `\n- This genre has no numerical system; leave UPDATED_LEDGER empty.`
      : `\n- 本题材无数值系统，UPDATED_LEDGER 留空`);

  const hookRules = isEnglish ? `
## Hook Tracking Rules (Strictly Enforced)

- New hooks: Only add a new hook_id when an unresolved question/suspense arises in the text that will persist into subsequent chapters and has a specific payoff direction. Do not open a new hook for restating, rephrasing, or abstractly summarizing an old hook.
- Mentioned hooks: If an existing hook is mentioned in this chapter, but no new information, evidence, relationship shift, risk escalation, or scope narrowing occurs → place it in the mention array, do not update the last advanced chapter.
- Advanced hooks: If an existing hook has new facts, evidence, relationship shifts, risk escalations, or scope narrowings in this chapter → **must** update the "lastAdvancedChapter" to the current chapter number, and update the status and notes.
- Resolved hooks: If a hook is explicitly revealed, resolved, or no longer stands in this chapter → change status to "resolved", note the resolution method.
- Deferred hooks: Mark as "deferred" only when the text explicitly shows that the hook is actively put aside, backgrounded, or delayed; do not defer mechanically just because "several chapters have passed".
- Brand-new unresolved thread: Do not fabricate a new hookId directly. Put candidate hooks into newHookCandidates, and the system will decide whether it maps to an old hook, becomes a true new hook, or gets rejected as a restatement.
- payoffTiming uses narrative pacing, not hard chapter numbers: only immediate / near-term / mid-arc / slow-burn / endgame are permitted.
- **Iron Law**: Do not treat "mentioning again", "rephrasing/restating", or "abstract review" as advancement. Update the last advanced chapter ONLY when the state actually changes. Otherwise, place it in the mention array.`
  : `
## 伏笔追踪规则（严格执行）

- 新伏笔：只有当正文中出现一个会延续到后续章节、且有具体回收方向的未解问题时，才新增 hook_id。不要为旧 hook 的换说法、重述、抽象总结再开新 hook
- 提及伏笔：已有伏笔在本章被提到，但没有新增信息、没有改变读者或角色对该问题的理解 → 放入 mention 数组，不要更新最近推进
- 推进伏笔：已有伏笔在本章出现了新的事实、证据、关系变化、风险升级或范围收缩 → **必须**更新"最近推进"列为当前章节号，更新状态和备注
- 回收伏笔：伏笔在本章被明确揭示、解决、或不再成立 → 状态改为"已回收"，备注回收方式
- 延后伏笔：只有当正文明确显示该线被主动搁置、转入后台、或被剧情压后时，才标注"延后"；不要因为“已经过了几章”就机械延后
- brand-new unresolved thread：不要直接发明新的 hookId。把候选放进 newHookCandidates，由系统决定它是映射到旧 hook、变成真正新 hook，还是被拒绝为重述
- payoffTiming 使用语义节奏，不用硬写章节号：只允许 immediate / near-term / mid-arc / slow-burn / endgame
- **铁律**：不要把“再次提到”“换个说法重述”“抽象复盘”当成推进。只有状态真的变了，才更新最近推进。只是出现过的旧 hook，放进 mention 数组。`;

  const fullCastBlock = bookRules?.enableFullCastTracking
    ? (isEnglish
      ? `\n## Full Cast Tracking\nPOST_SETTLEMENT must additionally contain: a list of characters appearing in this chapter, relationship changes, and characters mentioned but not appearing.`
      : `\n## 全员追踪\nPOST_SETTLEMENT 必须额外包含：本章出场角色清单、角色间关系变动、未出场但被提及的角色。`)
    : "";

  const langPrefix = isEnglish
    ? `【LANGUAGE OVERRIDE】ALL output (state card, hooks, summaries, subplots, emotional arcs, character matrix) MUST be in English. The === TAG === markers remain unchanged.\n\n`
    : "";

  const outputFormat = buildSettlerOutputFormat(genreProfile, isEnglish);

  return loadedTemplate
    .replaceAll("{{title}}", book.title)
    .replaceAll("{{genre}}", genreProfile.name)
    .replaceAll("{{genreCode}}", book.genre)
    .replaceAll("{{platform}}", book.platform)
    .replaceAll("{{langPrefix}}", langPrefix)
    .replaceAll("{{numericalBlock}}", numericalBlock)
    .replaceAll("{{hookRules}}", hookRules)
    .replaceAll("{{fullCastBlock}}", fullCastBlock)
    .replaceAll("{{outputFormat}}", outputFormat);
}

function buildSettlerOutputFormat(gp: GenreProfile, isEnglish?: boolean): string {
  const chapterTypeExample = gp.chapterTypes.length > 0
    ? gp.chapterTypes[0]
    : (isEnglish ? "Mainline Advance" : "主线推进");

  if (isEnglish) {
    return `=== POST_SETTLEMENT ===
(Briefly explain what state changes, hook advancements, and settlement notes occur in this chapter; Markdown tables or bullet points are permitted)

=== RUNTIME_STATE_DELTA ===
(Must output JSON, do NOT output Markdown, do NOT add explanation)
\`\`\`json
{
  "chapter": 12,
  "currentStatePatch": {
    "currentLocation": "optional",
    "protagonistState": "optional",
    "currentGoal": "optional",
    "currentConstraint": "optional",
    "currentAlliances": "optional",
    "currentConflict": "optional"
  },
  "hookOps": {
    "upsert": [
      {
        "hookId": "mentor-oath",
        "startChapter": 8,
        "type": "relationship",
        "status": "progressing",
        "lastAdvancedChapter": 12,
        "expectedPayoff": "reveal mentor's debt truth",
        "payoffTiming": "slow-burn",
        "notes": "why advanced/deferred/resolved in this chapter"
      }
    ],
    "mention": ["hookId mentioned in this chapter but not advanced"],
    "resolve": ["resolved hookId"],
    "defer": ["hookId that needs to be marked deferred"]
  },
  "newHookCandidates": [
    {
      "type": "mystery",
      "expectedPayoff": "where the new hook will be resolved in future",
      "payoffTiming": "near-term",
      "notes": "why this new unresolved question is raised in this chapter"
    }
  ],
  "chapterSummary": {
    "chapter": 12,
    "title": "chapter title",
    "characters": "char1,char2",
    "events": "one sentence summarizing key events",
    "stateChanges": "one sentence summarizing state changes",
    "hookActivity": "mentor-oath advanced",
    "mood": "tense",
    "chapterType": "${chapterTypeExample}"
  },
  "subplotOps": [],
  "emotionalArcOps": [],
  "characterMatrixOps": [],
  "notes": []
}
\`\`\`

Rules:
1. Only output delta, do not rewrite complete truth files.
2. All chapter number fields must be integers, do not write natural language.
3. Only hookIds that "already exist in the current hook pool" can be written in hookOps.upsert. Do not fabricate new hookIds.
4. All brand-new unresolved threads must be written in newHookCandidates, do not fabricate hookIds.
5. If an old hook is only mentioned and has no real state change, put it in mention, do not update lastAdvancedChapter.
6. If this chapter advances an old hook, lastAdvancedChapter must equal the current chapter number.
7. If resolving or deferring a hook, it must be placed in the resolve / defer arrays.
8. chapterSummary.chapter must equal the current chapter number.`;
  }

  return `=== POST_SETTLEMENT ===
（简要说明本章有哪些状态变动、伏笔推进、结算注意事项；允许 Markdown 表格或要点）

=== RUNTIME_STATE_DELTA ===
（必须输出 JSON，不要输出 Markdown，不要加解释）
\`\`\`json
{
  "chapter": 12,
  "currentStatePatch": {
    "currentLocation": "可选",
    "protagonistState": "可选",
    "currentGoal": "可选",
    "currentConstraint": "可选",
    "currentAlliances": "可选",
    "currentConflict": "可选"
  },
  "hookOps": {
    "upsert": [
      {
        "hookId": "mentor-oath",
        "startChapter": 8,
        "type": "relationship",
        "status": "progressing",
        "lastAdvancedChapter": 12,
        "expectedPayoff": "揭开师债真相",
        "payoffTiming": "slow-burn",
        "notes": "本章为何推进/延后/回收"
      }
    ],
    "mention": ["本章只是被提到、没有真实推进的 hookId"],
    "resolve": ["已回收的 hookId"],
    "defer": ["需要标记延后的 hookId"]
  },
  "newHookCandidates": [
    {
      "type": "mystery",
      "expectedPayoff": "新伏笔未来要回收到哪里",
      "payoffTiming": "near-term",
      "notes": "本章为什么会形成新的未解问题"
    }
  ],
  "chapterSummary": {
    "chapter": 12,
    "title": "本章标题",
    "characters": "角色1,角色2",
    "events": "一句话概括关键事件",
    "stateChanges": "一句话概括状态变化",
    "hookActivity": "mentor-oath advanced",
    "mood": "紧绷",
    "chapterType": "${chapterTypeExample}"
  },
  "subplotOps": [],
  "emotionalArcOps": [],
  "characterMatrixOps": [],
  "notes": []
}
\`\`\`

规则：
1. 只输出增量，不要重写完整 truth files
2. 所有章节号字段都必须是整数，不能写自然语言
3. hookOps.upsert 里只能写“当前伏笔池里已经存在”的 hookId，不允许发明新的 hookId
4. brand-new unresolved thread 一律写进 newHookCandidates，不要自造 hookId
5. 如果旧 hook 只是被提到、没有真实状态变化，把它放进 mention，不要更新 lastAdvancedChapter
6. 如果本章推进了旧 hook，lastAdvancedChapter 必须等于当前章号
7. 如果回收或延后 hook，必须放在 resolve / defer 数组里
8. chapterSummary.chapter 必须等于当前章节号`;
}

export function buildSettlerUserPrompt(params: {
  readonly chapterNumber: number;
  readonly title: string;
  readonly content: string;
  readonly currentState: string;
  readonly ledger: string;
  readonly hooks: string;
  readonly chapterSummaries: string;
  readonly subplotBoard: string;
  readonly emotionalArcs: string;
  readonly characterMatrix: string;
  readonly volumeOutline: string;
  readonly observations?: string;
  readonly selectedEvidenceBlock?: string;
  readonly governedControlBlock?: string;
  readonly validationFeedback?: string;
}): string {
  const ledgerBlock = params.ledger
    ? `\n## 当前资源账本\n${params.ledger}\n`
    : "";

  const summariesBlock = params.chapterSummaries !== "(文件尚未创建)"
    ? `\n## 已有章节摘要\n${params.chapterSummaries}\n`
    : "";

  const subplotBlock = params.subplotBoard !== "(文件尚未创建)"
    ? `\n## 当前支线进度板\n${params.subplotBoard}\n`
    : "";

  const emotionalBlock = params.emotionalArcs !== "(文件尚未创建)"
    ? `\n## 当前情感弧线\n${params.emotionalArcs}\n`
    : "";

  const matrixBlock = params.characterMatrix !== "(文件尚未创建)"
    ? `\n## 当前角色交互矩阵\n${params.characterMatrix}\n`
    : "";

  const observationsBlock = params.observations
    ? `\n## 观察日志（由 Observer 提取，包含本章所有事实变化）\n${params.observations}\n\n基于以上观察日志和正文，更新所有追踪文件。确保观察日志中的每一项变化都反映在对应的文件中。\n`
    : "";
  const selectedEvidenceBlock = params.selectedEvidenceBlock
    ? `\n## 已选长程证据\n${params.selectedEvidenceBlock}\n`
    : "";
  const controlBlock = params.governedControlBlock ?? "";
  const outlineBlock = controlBlock.length === 0
    ? `\n## 卷纲\n${params.volumeOutline}\n`
    : "";
  const validationFeedbackBlock = params.validationFeedback
    ? `\n## 状态校验反馈\n${params.validationFeedback}\n\n请严格纠正这些矛盾，只修正 truth files，不要改写正文，不要引入正文中不存在的新事实。\n`
    : "";

  return `请分析第${params.chapterNumber}章「${params.title}」的正文，更新所有追踪文件。
${observationsBlock}
${validationFeedbackBlock}
## 本章正文

${params.content}
${controlBlock}

## 当前状态卡
${params.currentState}
${ledgerBlock}
## 当前伏笔池
${params.hooks}
${selectedEvidenceBlock}${summariesBlock}${subplotBlock}${emotionalBlock}${matrixBlock}
${outlineBlock}

请严格按照 === TAG === 格式输出结算结果。`;
}
