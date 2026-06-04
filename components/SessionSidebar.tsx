"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SessionInfo } from "@/lib/types";
import { FileExplorer } from "./FileExplorer";
import { encodeFilePathForApi, joinFilePath } from "@/lib/file-paths";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  selectedSessionId: string | null;
  onSelectSession: (session: SessionInfo, isRestore?: boolean) => void;
  onNewSession?: (sessionId: string, cwd: string, gemId?: string | null) => void;
  initialSessionId?: string | null;
  onInitialRestoreDone?: () => void;
  refreshKey?: number;
  onSessionDeleted?: (sessionId: string) => void;
  selectedCwd?: string | null;
  onCwdChange?: (cwd: string | null) => void;
  onOpenFile?: (filePath: string, fileName: string) => void;
  explorerRefreshKey?: number;
  onAtMention?: (relativePath: string) => void;
  activeGemId?: string | null;

  availableStyles?: string[];
  activeStyleName?: string | null;
  onStylesChange?: (styles: string[], activeStyle: string | null) => void;
  onWorkspaceStatusChange?: (isInkos: boolean, hasBooks: boolean) => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

/** Return the 5 most recently active cwds across all sessions */
function getRecentCwds(sessions: SessionInfo[]): string[] {
  const latestByCwd = new Map<string, string>(); // cwd -> most recent modified
  for (const s of sessions) {
    if (!s.cwd) continue;
    const prev = latestByCwd.get(s.cwd);
    if (!prev || s.modified > prev) {
      latestByCwd.set(s.cwd, s.modified);
    }
  }
  return [...latestByCwd.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, 5)
    .map(([cwd]) => cwd);
}

function shortenCwd(cwd: string, homeDir?: string): string {
  return (homeDir && cwd.startsWith(homeDir)) ? "~" + cwd.slice(homeDir.length) : cwd;
}



interface SessionTreeNode {
  session: SessionInfo;
  children: SessionTreeNode[];
}

function buildSessionTree(sessions: SessionInfo[]): SessionTreeNode[] {
  const byId = new Map<string, SessionTreeNode>();
  for (const s of sessions) {
    byId.set(s.id, { session: s, children: [] });
  }

  // Build a map of parentSessionId chains so we can resolve missing ancestors
  const parentOf = new Map<string, string>();
  for (const s of sessions) {
    if (s.parentSessionId) parentOf.set(s.id, s.parentSessionId);
  }

  // Walk up the parentSessionId chain to find the nearest ancestor that exists in byId
  function resolveAncestor(id: string): string | null {
    let cur = parentOf.get(id);
    const visited = new Set<string>();
    while (cur) {
      if (visited.has(cur)) return null; // cycle guard
      visited.add(cur);
      if (byId.has(cur)) return cur;
      cur = parentOf.get(cur);
    }
    return null;
  }

  const roots: SessionTreeNode[] = [];
  for (const node of byId.values()) {
    const ancestor = resolveAncestor(node.session.id);
    if (ancestor) {
      byId.get(ancestor)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort each level by locked desc first, then by modified desc
  const sort = (nodes: SessionTreeNode[]) => {
    nodes.sort((a, b) => {
      const lockA = a.session.locked ? 1 : 0;
      const lockB = b.session.locked ? 1 : 0;
      if (lockA !== lockB) return lockB - lockA;
      return b.session.modified.localeCompare(a.session.modified);
    });
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";

function useScramble(target: string, running: boolean): string {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef<number | null>(null);
  const iterRef = useRef(0);

  useEffect(() => {
    if (!running) {
      setDisplay(target);
      return;
    }
    iterRef.current = 0;
    const totalFrames = target.length * 4;

    const step = () => {
      iterRef.current += 1;
      const progress = iterRef.current / totalFrames;
      const resolved = Math.floor(progress * target.length);

      setDisplay(
        target
          .split("")
          .map((char, i) => {
            if (char === " ") return " ";
            if (i < resolved) return char;
            return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          })
          .join("")
      );

      if (iterRef.current < totalFrames) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        setDisplay(target);
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target, running]);

  return display;
}

function StudioTitle() {
  const [showVersion, setShowVersion] = useState(false);
  const [scrambling, setScrambling] = useState(false);
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const target = showVersion ? `v${process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0"}` : "ink-xY Studio";
  const display = useScramble(target, scrambling);

  const triggerScramble = useCallback((toVersion: boolean) => {
    setShowVersion(toVersion);
    setScrambling(true);
    setTimeout(() => setScrambling(false), (toVersion ? 6 : 8) * 4 * (1000 / 60) + 100);
  }, []);

  const handleClick = useCallback(() => {
    if (revertTimerRef.current) clearTimeout(revertTimerRef.current);

    const next = !showVersion;
    triggerScramble(next);

    if (next) {
      revertTimerRef.current = setTimeout(() => triggerScramble(false), 3000);
    }
  }, [showVersion, triggerScramble]);

  useEffect(() => () => { if (revertTimerRef.current) clearTimeout(revertTimerRef.current); }, []);

  return (
    <button
      onClick={handleClick}
      style={{
        background: "none", border: "none", padding: 0, cursor: "default",
        fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em",
        color: showVersion ? "var(--accent)" : "var(--text)",
        fontFamily: "var(--font-mono)",
        minWidth: "6ch",
      }}
    >
      {display}
    </button>
  );
}

import GemEditorModal from "./GemEditorModal";
import type { GemProfile } from "@/lib/types";

export function SessionSidebar({ selectedSessionId, onSelectSession, onNewSession, initialSessionId, onInitialRestoreDone, refreshKey, onSessionDeleted, selectedCwd: selectedCwdProp, onCwdChange, onOpenFile, explorerRefreshKey, onAtMention, activeGemId, availableStyles = [], activeStyleName = null, onStylesChange, onWorkspaceStatusChange }: Props) {
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null);
  const [homeDir, setHomeDir] = useState<string>("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [customPathOpen, setCustomPathOpen] = useState(false);
  const [customPathValue, setCustomPathValue] = useState("");
  const customPathInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [explorerKey, setExplorerKey] = useState(0);

  // Gem-xY custom agent states
  const [gems, setGems] = useState<GemProfile[]>([]);
  const [modelList, setModelList] = useState<{ id: string; name: string; provider: string }[]>([]);
  const [defaultModel, setDefaultModel] = useState<{ provider: string; modelId: string } | null>(null);
  const [isGemModalOpen, setIsGemModalOpen] = useState(false);
  const [editingGemId, setEditingGemId] = useState<string | null>(null);
  const [gemsExpanded, setGemsExpanded] = useState(true);
  const [sessionsExpanded, setSessionsExpanded] = useState(false);

  // InkOS workspace states
  const [isInkosWorkspace, setIsInkosWorkspace] = useState(true);
  const [hasBooks, setHasBooks] = useState(true);
  const [hasShorts, setHasShorts] = useState(false);
  const [showImportDraft, setShowImportDraft] = useState(true);
  const [showAutoGenerateShort, setShowAutoGenerateShort] = useState(true);
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [isDeleteBookModalOpen, setIsDeleteBookModalOpen] = useState(false);
  const [isDeletingBook, setIsDeletingBook] = useState(false);
  const [deleteBookError, setDeleteBookError] = useState<string | null>(null);

  const [hasChapters, setHasChapters] = useState(false);
  const [hasFirstChapterBlueprint, setHasFirstChapterBlueprint] = useState(false);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const activeBookIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeBookIdRef.current = activeBookId;
  }, [activeBookId]);

  const [isWriteLoading, setIsWriteLoading] = useState(false);
  const [writeProgressText, setWriteProgressText] = useState("");
  const [writeReportTitle, setWriteReportTitle] = useState("");
  const [writeReportContent, setWriteReportContent] = useState("");
  const [isWriteReportOpen, setIsWriteReportOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [registeredCwd, setRegisteredCwd] = useState<string | null>(null);
  const [validRecentCwds, setValidRecentCwds] = useState<string[]>([]);
  const [recentCwdsChecked, setRecentCwdsChecked] = useState(false);
  const [chapterStatusMap, setChapterStatusMap] = useState<Record<number, string>>({});
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"txt" | "md" | "epub">("epub");
  const [exportApprovedOnly, setExportApprovedOnly] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccessText, setExportSuccessText] = useState<string | null>(null);
  const [exportLogs, setExportLogs] = useState<string[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);

  // InkOS import states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [activeImportTab, setActiveImportTab] = useState<"chapters" | "canon">("chapters");
  const [importFromPath, setImportFromPath] = useState("");
  const [importSplitRegex, setImportSplitRegex] = useState("");
  const [importResumeFrom, setImportResumeFrom] = useState("");
  const [importIsSeries, setImportIsSeries] = useState(false);
  const [importCanonFromBookId, setImportCanonFromBookId] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccessText, setImportSuccessText] = useState<string | null>(null);
  const [availableBooks, setAvailableBooks] = useState<string[]>([]);
  const [importBookSelection, setImportBookSelection] = useState<"active" | "new">("active");
  const [newBookId, setNewBookId] = useState("");
  const [newBookTitle, setNewBookTitle] = useState("");

  // InkOS style clone states
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
  const [styleMode, setStyleMode] = useState<"paste" | "path">("paste");
  const [styleName, setStyleName] = useState("");
  const [styleText, setStyleText] = useState("");
  const [stylePath, setStylePath] = useState("");
  const [isCloning, setIsCloning] = useState(false);
  const [isStyleSwitching, setIsStyleSwitching] = useState(false);
  const [styleLogs, setStyleLogs] = useState<string[]>([]);
  const [styleError, setStyleError] = useState<string | null>(null);
  const [styleSuccessText, setStyleSuccessText] = useState<string | null>(null);
  const [styleGuidePath, setStyleGuidePath] = useState<string | null>(null);

  // InkOS fanfic states
  const [fanficMode, setFanficMode] = useState<"canon" | "au" | "ooc" | "cp">("canon");
  const [fanficSource, setFanficSource] = useState("");
  const [isFanfic, setIsFanfic] = useState(false);
  const [activeFanficMode, setActiveFanficMode] = useState<string | null>(null);

  // Fanfic refresh states
  const [isFanficRefreshModalOpen, setIsFanficRefreshModalOpen] = useState(false);
  const [fanficRefreshSource, setFanficRefreshSource] = useState("");
  const [isRefreshingCanon, setIsRefreshingCanon] = useState(false);
  const [fanficRefreshLogs, setFanficRefreshLogs] = useState<string[]>([]);
  const [fanficRefreshError, setFanficRefreshError] = useState<string | null>(null);
  const [fanficRefreshSuccess, setFanficRefreshSuccess] = useState<string | null>(null);
  const fanficRefreshConsoleRef = useRef<HTMLDivElement>(null);

  // Radar scan states
  const [isRadarModalOpen, setIsRadarModalOpen] = useState(false);
  const [isScanningRadar, setIsScanningRadar] = useState(false);
  const [radarLogs, setRadarLogs] = useState<string[]>([]);
  const [radarError, setRadarError] = useState<string | null>(null);
  const [radarResult, setRadarResult] = useState<any>(null);
  const radarConsoleRef = useRef<HTMLDivElement>(null);

  // Short fiction production states
  const [isShortRunModalOpen, setIsShortRunModalOpen] = useState(false);
  const [isRunningShort, setIsRunningShort] = useState(false);
  const [shortLogs, setShortLogs] = useState<string[]>([]);
  const [shortError, setShortError] = useState<string | null>(null);
  const [shortSuccess, setShortSuccess] = useState<string | null>(null);
  const [shortDirection, setShortDirection] = useState("");
  const [shortChapters, setShortChapters] = useState(12);
  const [shortChars, setShortChars] = useState(1000);
  const [shortCover, setShortCover] = useState(true);
  const [shortStoryId, setShortStoryId] = useState<string | null>(null);
  const [shortFictionStage, setShortFictionStage] = useState<"outline" | "draft" | "package" | "completed" | "idle">("idle");
  const shortConsoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fanficRefreshConsoleRef.current) {
      fanficRefreshConsoleRef.current.scrollTop = fanficRefreshConsoleRef.current.scrollHeight;
    }
  }, [fanficRefreshLogs]);

  useEffect(() => {
    if (radarConsoleRef.current) {
      radarConsoleRef.current.scrollTop = radarConsoleRef.current.scrollHeight;
    }
  }, [radarLogs]);

  useEffect(() => {
    if (shortConsoleRef.current) {
      shortConsoleRef.current.scrollTop = shortConsoleRef.current.scrollHeight;
    }
  }, [shortLogs]);

  useEffect(() => {
    const importVal = localStorage.getItem("ink-show-import-draft");
    if (importVal !== null) {
      setShowImportDraft(importVal === "true");
    }
    const autoShortVal = localStorage.getItem("ink-show-auto-generate-short");
    if (autoShortVal !== null) {
      setShowAutoGenerateShort(autoShortVal === "true");
    }

    const handleSettings = (e: Event) => {
      const customEvent = e as CustomEvent<{ showImportDraft?: boolean; showAutoGenerateShort?: boolean }>;
      if (customEvent.detail) {
        if (typeof customEvent.detail.showImportDraft === "boolean") {
          setShowImportDraft(customEvent.detail.showImportDraft);
        }
        if (typeof customEvent.detail.showAutoGenerateShort === "boolean") {
          setShowAutoGenerateShort(customEvent.detail.showAutoGenerateShort);
        }
      }
    };
    window.addEventListener("ink-settings-changed", handleSettings);
    return () => {
      window.removeEventListener("ink-settings-changed", handleSettings);
    };
  }, []);

  // InkOS consolidate states
  const [consolidationRecommend, setConsolidationRecommend] = useState(false);
  const [recommendVolumeName, setRecommendVolumeName] = useState<string>("");
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [isConsolidationModalOpen, setIsConsolidationModalOpen] = useState(false);
  const [consolidationLogs, setConsolidationLogs] = useState<string[]>([]);
  const [consolidationError, setConsolidationError] = useState<string | null>(null);
  const [consolidationResult, setConsolidationResult] = useState<{ archivedVolumes: number; retainedChapters: number } | null>(null);

  const importConsoleRef = useRef<HTMLDivElement>(null);
  const styleConsoleRef = useRef<HTMLDivElement>(null);
  const consolidateConsoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (importConsoleRef.current) {
      importConsoleRef.current.scrollTop = importConsoleRef.current.scrollHeight;
    }
  }, [importLogs]);

  useEffect(() => {
    if (styleConsoleRef.current) {
      styleConsoleRef.current.scrollTop = styleConsoleRef.current.scrollHeight;
    }
  }, [styleLogs]);

  useEffect(() => {
    if (consolidateConsoleRef.current) {
      consolidateConsoleRef.current.scrollTop = consolidateConsoleRef.current.scrollHeight;
    }
  }, [consolidationLogs]);

  // Book creation form state
  const [bookTitle, setBookTitle] = useState("");
  const [bookGenre, setBookGenre] = useState("xuanhuan");
  const [bookPlatform, setBookPlatform] = useState("tomato");
  const [bookBrief, setBookBrief] = useState("");

  const [detectedFramework, setDetectedFramework] = useState<{ name: string; fullPath: string } | null>(null);
  const [detectedCharacter, setDetectedCharacter] = useState<{ name: string; fullPath: string } | null>(null);
  const [useFramework, setUseFramework] = useState(true);
  const [useCharacter, setUseCharacter] = useState(true);

  useEffect(() => {
    if (!isBookModalOpen) {
      setDetectedFramework(null);
      setDetectedCharacter(null);
      setUseFramework(true);
      setUseCharacter(true);
      return;
    }
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd) return;

    const scanLocalFiles = async () => {
      try {
        let fw: { name: string; fullPath: string } | null = null;
        let char: { name: string; fullPath: string } | null = null;

        // De-duplicate directories to avoid case-insensitive duplication on Windows
        const directoriesToCheck = [
          { name: "根目录", path: activeCwd },
          { name: "Temp", path: `${activeCwd}/Temp` },
          { name: "temp", path: `${activeCwd}/temp` }
        ].filter((dir, idx, self) => {
          return self.findIndex(d => d.path.toLowerCase().replace(/\\/g, "/") === dir.path.toLowerCase().replace(/\\/g, "/")) === idx;
        });

        const frameworkNames = ["novel_framework_v2.md", "novel_framework.md", "novel-framework.md", "架构.md", "构架.md"];
        const characterNames = ["character_profiles.md", "character-profiles.md", "character.md", "人设.md"];

        for (const dirInfo of directoriesToCheck) {
          try {
            const res = await fetch(`/api/files/${encodeFilePathForApi(dirInfo.path)}?type=list`);
            if (!res.ok) continue;
            const data = await res.json();
            if (data.entries) {
              // Find framework if not already found
              if (!fw) {
                const found = data.entries.find((e: any) => !e.isDir && frameworkNames.includes(e.name.toLowerCase()));
                if (found) {
                  fw = {
                    name: found.name,
                    fullPath: `${dirInfo.path}/${found.name}`
                  };
                }
              }
              // Find character if not already found
              if (!char) {
                const found = data.entries.find((e: any) => !e.isDir && characterNames.includes(e.name.toLowerCase()));
                if (found) {
                  char = {
                    name: found.name,
                    fullPath: `${dirInfo.path}/${found.name}`
                  };
                }
              }
            }
          } catch (e) {
            // ignore folder read failures
          }
        }
        
        setDetectedFramework(fw);
        setDetectedCharacter(char);
      } catch (e) {
        console.error("Failed to scan local framework/character files:", e);
      }
    };
    
    scanLocalFiles();
  }, [isBookModalOpen, selectedCwdProp, selectedCwd]);

  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const checkWorkspaceStatus = useCallback(async (cwd: string, targetBookId?: string) => {
    if (!cwd) return;
    try {
      const encoded = encodeFilePathForApi(cwd);
      const res = await fetch(`/api/files/${encoded}?type=list`);
      if (!res.ok) {
        setIsInkosWorkspace(false);
        setHasBooks(false);
        setHasShorts(false);
        setActiveBookId(null);
        setHasChapters(false);
        setChapterStatusMap({});
        setAvailableBooks([]);
        setConsolidationRecommend(false);
        setRecommendVolumeName("");
        setIsFanfic(false);
        setActiveFanficMode(null);
        return;
      }
      const data = await res.json();
      const entries = data.entries || [];
      const hasSignature = entries.some(
        (e: any) => e.name === ".inkos" || e.name === "story" || e.name === "books"
      );
      setIsInkosWorkspace(hasSignature);

      if (hasSignature) {
        // Check if there are generated short stories in shorts directory
        let hasShortsVal = false;
        try {
          const shortsDir = joinFilePath(cwd, "shorts");
          const shortsEncoded = encodeFilePathForApi(shortsDir);
          const shortsRes = await fetch(`/api/files/${shortsEncoded}?type=list`);
          if (shortsRes.ok) {
            const shortsData = await shortsRes.json();
            const shortsEntries = shortsData.entries || [];
            const actualShorts = shortsEntries.filter((e: any) => e.name !== ".gitkeep" && !e.name.startsWith("."));
            hasShortsVal = actualShorts.length > 0;
          }
        } catch (e) {
          console.error("Failed to check shorts folder status:", e);
        }
        setHasShorts(hasShortsVal);

        const booksDir = joinFilePath(cwd, "books");
        const booksEncoded = encodeFilePathForApi(booksDir);
        const booksRes = await fetch(`/api/files/${booksEncoded}?type=list`);
        if (booksRes.ok) {
          const booksData = await booksRes.json();
          const bookEntries = booksData.entries || [];
          const actualBooks = bookEntries.filter((e: any) => e.name !== ".gitkeep" && !e.name.startsWith("."));
          const hasBooksVal = actualBooks.length > 0;
          setHasBooks(hasBooksVal);
          const bookNames = actualBooks.map((e: any) => e.name);
          setAvailableBooks(bookNames);

          if (hasBooksVal) {
            let selectedBook: string | null = targetBookId || null;
            if (!selectedBook || !bookNames.includes(selectedBook)) {
              const currentActive = activeBookIdRef.current;
              if (currentActive && bookNames.includes(currentActive)) {
                selectedBook = currentActive;
              } else {
                selectedBook = actualBooks[0].name;
              }
            }
            setActiveBookId(selectedBook);


            // Check if it is a fanfic book
            try {
              const bookJsonPath = joinFilePath(cwd, `books/${selectedBook}/book.json`);
              const bookJsonEncoded = encodeFilePathForApi(bookJsonPath);
              const bookJsonRes = await fetch(`/api/files/${bookJsonEncoded}?type=read`);
              if (bookJsonRes.ok) {
                const bookJsonData = await bookJsonRes.json();
                const bookParsed = JSON.parse(bookJsonData.content);
                if (bookParsed && bookParsed.fanficMode) {
                  setIsFanfic(true);
                  setActiveFanficMode(bookParsed.fanficMode);
                } else {
                  setIsFanfic(false);
                  setActiveFanficMode(null);
                }
              } else {
                setIsFanfic(false);
                setActiveFanficMode(null);
              }
            } catch (err) {
              console.error("Failed to parse book.json for fanfic mode:", err);
              setIsFanfic(false);
              setActiveFanficMode(null);
            }

            const chaptersDir = joinFilePath(cwd, `books/${selectedBook}/chapters`);
            const chaptersEncoded = encodeFilePathForApi(chaptersDir);
            const chaptersRes = await fetch(`/api/files/${chaptersEncoded}?type=list`);
            let maxChapter = 0;
            if (chaptersRes.ok) {
              const chaptersData = await chaptersRes.json();
              const chapterEntries = chaptersData.entries || [];
              const mdFiles = chapterEntries.filter(
                (e: any) => !e.isDir && e.name.endsWith(".md") && /^\d{4}/.test(e.name)
              );
              setHasChapters(mdFiles.length > 0);

              const fileNumbers = mdFiles.map((f: any) => {
                const m = f.name.match(/^(\d+)/);
                return m ? parseInt(m[1], 10) : 0;
              }).filter((n: number) => n > 0);
              maxChapter = fileNumbers.length > 0 ? Math.max(...fileNumbers) : 0;
            } else {
              setHasChapters(false);
            }

            // Check if Chapter 1 plan exists
            let hasPlan = false;
            try {
              const planPath = joinFilePath(cwd, `books/${selectedBook}/story/runtime/chapter-0001.plan.md`);
              const planEncoded = encodeFilePathForApi(planPath);
              const planRes = await fetch(`/api/files/${planEncoded}?type=read`);
              if (planRes.ok) {
                hasPlan = true;
              }
            } catch (e) {
              console.error("Failed to check chapter-0001.plan.md:", e);
            }
            setHasFirstChapterBlueprint(hasPlan);

            // Consolidation recommendation check
            try {
              let volumeMapText = "";
              const newPath = joinFilePath(cwd, `books/${selectedBook}/story/outline/volume_map.md`);
              const newEncoded = encodeFilePathForApi(newPath);
              const newRes = await fetch(`/api/files/${newEncoded}?type=read`);
              if (newRes.ok) {
                const fileData = await newRes.json();
                if (fileData && fileData.content) volumeMapText = fileData.content;
              }
              if (!volumeMapText.trim()) {
                const legacyPath = joinFilePath(cwd, `books/${selectedBook}/story/volume_outline.md`);
                const legacyEncoded = encodeFilePathForApi(legacyPath);
                const legacyRes = await fetch(`/api/files/${legacyEncoded}?type=read`);
                if (legacyRes.ok) {
                  const fileData = await legacyRes.json();
                  if (fileData && fileData.content) volumeMapText = fileData.content;
                }
              }

              if (volumeMapText.trim()) {
                const parseVolumeBoundaries = (text: string) => {
                  const volumes: Array<{ name: string; startCh: number; endCh: number }> = [];
                  const lines = text.split("\n");
                  const volumeHeader = /^(第[一二三四五六七八九十百千万零〇\d]+卷|Volume\s+\d+)/i;
                  const rangePattern = /[（(]\s*(?:第|[Cc]hapters?\s+)?(\d+)\s*[-–~～—]\s*(\d+)\s*(?:章)?\s*[）)]|(?:第|[Cc]hapters?\s+)(\d+)\s*[-–~～—]\s*(\d+)\s*(?:章)?/i;

                  for (const rawLine of lines) {
                    const line = rawLine.replace(/^#+\s*/, "").trim();
                    if (!volumeHeader.test(line)) continue;

                    const rangeMatch = line.match(rangePattern);
                    if (!rangeMatch) continue;

                    const startCh = parseInt(rangeMatch[1] ?? rangeMatch[3] ?? "0", 10);
                    const endCh = parseInt(rangeMatch[2] ?? rangeMatch[4] ?? "0", 10);
                    if (startCh <= 0 || endCh <= 0) continue;

                    const nameMatch = line.match(/^([^\(（]+)/);
                    const name = nameMatch ? nameMatch[1].trim() : line;
                    volumes.push({ name, startCh, endCh });
                  }
                  return volumes;
                };

                const volumes = parseVolumeBoundaries(volumeMapText);
                
                let volSummariesText = "";
                const volSummariesPath = joinFilePath(cwd, `books/${selectedBook}/story/volume_summaries.md`);
                const volSummariesEncoded = encodeFilePathForApi(volSummariesPath);
                const volSummariesRes = await fetch(`/api/files/${volSummariesEncoded}?type=read`);
                if (volSummariesRes.ok) {
                  const fileData = await volSummariesRes.json();
                  if (fileData && fileData.content) volSummariesText = fileData.content;
                }

                let recommend = false;
                let recommendVolName = "";

                for (const vol of volumes) {
                  if (maxChapter >= vol.endCh) {
                    const isConsolidated = volSummariesText.includes(vol.name) || 
                                           volSummariesText.includes(`Ch.${vol.startCh}-${vol.endCh}`) ||
                                           volSummariesText.includes(`vol_${vol.startCh}-${vol.endCh}`);
                    if (!isConsolidated) {
                      recommend = true;
                      recommendVolName = `${vol.name} (${vol.startCh}-${vol.endCh}章)`;
                      break;
                    }
                  }
                }
                setConsolidationRecommend(recommend);
                setRecommendVolumeName(recommendVolName);
              } else {
                setConsolidationRecommend(false);
                setRecommendVolumeName("");
              }
            } catch (err) {
              console.error("Failed to check consolidation status:", err);
              setConsolidationRecommend(false);
              setRecommendVolumeName("");
            }

            // Fetch styles list and active style for the book
            try {
              const stylesRes = await fetch("/api/inkos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "style-list",
                  cwd,
                  args: { bookId: selectedBook }
                })
              });
              if (stylesRes.ok) {
                const stylesData = await stylesRes.json();
                if (onStylesChange) {
                  onStylesChange(stylesData.styles || [], stylesData.activeStyle || null);
                }
              }
            } catch (err) {
              console.error("Failed to load style list:", err);
            }

            // Load chapter index.json to retrieve statuses
            const indexPath = joinFilePath(cwd, `books/${selectedBook}/chapters/index.json`);
            const indexEncoded = encodeFilePathForApi(indexPath);
            const indexRes = await fetch(`/api/files/${indexEncoded}?type=read`);
            if (indexRes.ok) {
              try {
                const indexData = await indexRes.json();
                const parsed = JSON.parse(indexData.content);
                const map: Record<number, string> = {};
                if (Array.isArray(parsed)) {
                  for (const ch of parsed) {
                    if (ch && typeof ch.number === "number" && ch.status) {
                      map[ch.number] = ch.status;
                    }
                  }
                }
                setChapterStatusMap(map);
              } catch (err) {
                console.error("Failed to parse chapter index.json:", err);
                setChapterStatusMap({});
              }
            } else {
              setChapterStatusMap({});
            }
          } else {
            setActiveBookId(null);
            setHasChapters(false);
            setChapterStatusMap({});
            setConsolidationRecommend(false);
            setRecommendVolumeName("");
            setIsFanfic(false);
            setActiveFanficMode(null);
          }
        } else {
          setHasBooks(false);
          setActiveBookId(null);
          setHasChapters(false);
          setChapterStatusMap({});
          setAvailableBooks([]);
          setConsolidationRecommend(false);
          setRecommendVolumeName("");
          setIsFanfic(false);
          setActiveFanficMode(null);
        }
      } else {
        setHasBooks(false);
        setHasShorts(false);
        setActiveBookId(null);
        setHasChapters(false);
        setChapterStatusMap({});
        setAvailableBooks([]);
        setConsolidationRecommend(false);
        setRecommendVolumeName("");
        setIsFanfic(false);
        setActiveFanficMode(null);
      }
    } catch (e) {
      console.error("Failed to verify workspace status:", e);
    }
  }, [onStylesChange]);


  const handleExportBook = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd || !activeBookId) return;

    setIsExporting(true);
    setExportError(null);
    setExportSuccessText(null);
    setExportLogs([]);

    // We will generate a unique filename under E:\ink-xY\Temp so it's downloadable
    const filename = `${activeBookId}_export_${Date.now()}.${exportFormat}`;
    const outputAbsPath = `${activeCwd}/Temp/${filename}`;

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "export",
          cwd: activeCwd,
          args: {
            bookId: activeBookId,
            format: exportFormat,
            approvedOnly: exportApprovedOnly,
            output: outputAbsPath,
            json: true
          }
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("响应正文流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === "stdout" || chunk.type === "stderr") {
              setExportLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (err) {}
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (err) {}
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || "书稿导出执行失败，请检查配置或存量章节。");
      }

      // Parse JSON from final stdout
      let resultData: any = null;
      try {
        resultData = JSON.parse(finalResult.stdout);
      } catch (err) {
        console.error("Failed to parse export stdout:", err);
      }

      if (resultData && resultData.error) {
        throw new Error(resultData.error);
      }

      // Trigger automatic browser download
      const encodedDownloadPath = encodeFilePathForApi(outputAbsPath);
      const downloadUrl = `/api/files/${encodedDownloadPath}?type=read`;
      
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${activeBookId}_export.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setExportSuccessText(`🎉 导出成功！已导出 ${resultData?.chaptersExported ?? "全部"} 章节，共 ${resultData?.totalWords ?? 0} 字。`);
      setExplorerKey((k) => k + 1); // refresh explorer
    } catch (err: any) {
      console.error(err);
      setExportError(err.message || "书稿导出失败，请重试。");
    } finally {
      setIsExporting(false);
    }
  };

  const handleRunConsolidate = async () => {
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd || !activeBookId) return;

    setIsConsolidating(true);
    setConsolidationError(null);
    setConsolidationResult(null);
    setConsolidationLogs([]);
    setIsConsolidationModalOpen(true);

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "consolidate",
          cwd: activeCwd,
          args: { bookId: activeBookId, json: true }
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("响应正文流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === "stdout" || chunk.type === "stderr") {
              setConsolidationLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (e) {
            console.error("Failed to parse stream chunk:", e);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (e) {}
      }

      if (!finalResult || !finalResult.success) {
        let errMsg = "";
        if (finalResult) {
          if (finalResult.error) {
            errMsg = finalResult.error;
          } else if (finalResult.stdout) {
            try {
              const parsed = JSON.parse(finalResult.stdout);
              if (parsed && parsed.error) {
                errMsg = parsed.error;
              } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[parsed.length - 1]?.error) {
                errMsg = parsed[parsed.length - 1].error;
              }
            } catch (e) {}
          }
          if (!errMsg && finalResult.stderr) {
            errMsg = finalResult.stderr.trim();
          }
        }
        throw new Error(errMsg || "大纲摘要压缩执行失败");
      }

      let result: any = null;
      try {
        result = JSON.parse(finalResult.stdout);
      } catch (e) {
        console.error("Failed to parse consolidate JSON output:", e);
      }

      if (result) {
        setConsolidationResult({
          archivedVolumes: result.archivedVolumes ?? 0,
          retainedChapters: result.retainedChapters ?? 0,
        });
      } else {
        setConsolidationResult({ archivedVolumes: 1, retainedChapters: 0 });
      }

      await checkWorkspaceStatus(activeCwd);
      setExplorerKey((prev) => prev + 1);

    } catch (err: any) {
      console.error(err);
      setConsolidationError(err.message || String(err));
    } finally {
      setIsConsolidating(false);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd) return;

    setIsImporting(true);
    setImportError(null);
    setImportSuccessText(null);
    setImportLogs([]);

    try {
      const targetBookId = (importBookSelection === "new" || availableBooks.length === 0)
        ? newBookId.trim()
        : (activeBookId || undefined);

      if ((importBookSelection === "new" || availableBooks.length === 0) && activeImportTab === "chapters") {
        if (!targetBookId) {
          throw new Error("新书籍 ID 不能为空");
        }
        const bTitle = newBookTitle.trim() || targetBookId;
        
        setImportLogs((prev) => [...prev, `[System] 正在自动创建新书籍 "${targetBookId}" (${bTitle})...\n`]);
        
        const createRes = await fetch("/api/inkos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "book-create",
            cwd: activeCwd,
            args: {
              title: bTitle,
              genre: "xuanhuan",
              platform: "tomato",
            }
          })
        });

        if (!createRes.ok) {
          throw new Error(`创建新书籍失败，HTTP 异常 ${createRes.status}`);
        }

        if (!createRes.body) {
          throw new Error("创建新书籍响应流为空");
        }

        const createReader = createRes.body.getReader();
        const createDecoder = new TextDecoder();
        let createBuffer = "";
        let createResult: { success: boolean; error?: string } | null = null;

        while (true) {
          const { done, value } = await createReader.read();
          if (done) break;
          createBuffer += createDecoder.decode(value, { stream: true });
          const lines = createBuffer.split("\n");
          createBuffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const chunk = JSON.parse(line);
              if (chunk.type === "stdout" || chunk.type === "stderr") {
                setImportLogs((prev) => [...prev, chunk.data || ""]);
              } else if (chunk.type === "result") {
                createResult = chunk;
              }
            } catch (err) {}
          }
        }

        if (createBuffer.trim()) {
          try {
            const chunk = JSON.parse(createBuffer);
            if (chunk.type === "result") createResult = chunk;
          } catch (err) {}
        }

        if (!createResult || !createResult.success) {
          throw new Error(createResult?.error || "创建新书籍失败");
        }

        setImportLogs((prev) => [...prev, `[System] 新书籍创建完成，正在导入章节数据...\n`]);
      }

      let body: Record<string, unknown> = {};
      if (activeImportTab === "chapters") {
        if (!importFromPath.trim()) {
          throw new Error("导入源路径不能为空");
        }
        body = {
          action: "import-chapters",
          cwd: activeCwd,
          args: {
            bookId: targetBookId,
            from: importFromPath.trim(),
            split: importSplitRegex.trim() || undefined,
            resumeFrom: importResumeFrom ? parseInt(importResumeFrom, 10) : undefined,
            series: importIsSeries,
            json: true
          }
        };
      } else {
        if (!importCanonFromBookId.trim()) {
          throw new Error("请选择或输入原著/前作 Book ID");
        }
        body = {
          action: "import-canon",
          cwd: activeCwd,
          args: {
            bookId: activeBookId || undefined,
            from: importCanonFromBookId.trim(),
            json: true
          }
        };
      }

      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("响应正文流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: { success: boolean; stdout?: string; stderr?: string; error?: string } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === "stdout" || chunk.type === "stderr") {
              setImportLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (err) {}
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (err) {}
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || "导入执行失败，请检查路径或日志。");
      }

      if (activeImportTab === "chapters") {
        let resultData: { importedCount?: number; totalWords?: number } | null = null;
        try {
          if (finalResult.stdout) {
            resultData = JSON.parse(finalResult.stdout);
          }
        } catch (err) {}
        const imported = resultData?.importedCount ?? "部分";
        const words = resultData?.totalWords ?? 0;
        setImportSuccessText(`🎉 成功导入章节！共处理了 ${imported} 章节，约 ${words} 字。逆向工程设定提取成功！`);
      } else {
        setImportSuccessText(`🎉 成功导入前作设定！世界观与人物正典已同步成功。`);
      }

      // Refresh status and file explorer tree
      await checkWorkspaceStatus(activeCwd);
      setExplorerKey((k) => k + 1);
      window.dispatchEvent(new CustomEvent("refresh-explorer"));
    } catch (err: any) {
      console.error(err);
      setImportError(err.message || "导入执行失败，请重试。");
    } finally {
      setIsImporting(false);
    }
  };

  const handleStyleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd || !activeBookId) return;

    setIsCloning(true);
    setStyleError(null);
    setStyleSuccessText(null);
    setStyleLogs([]);
    setStyleGuidePath(null);

    try {
      const name = styleName.trim();
      if (!name) {
        throw new Error("文风名称不能为空");
      }

      let body: Record<string, unknown> = {};
      if (styleMode === "paste") {
        if (!styleText.trim()) {
          throw new Error("克隆样文本内容不能为空");
        }
        body = {
          action: "style-import",
          cwd: activeCwd,
          args: {
            bookId: activeBookId,
            content: styleText.trim(),
            name: name,
            json: true
          }
        };
      } else {
        if (!stylePath.trim()) {
          throw new Error("克隆样文绝对路径不能为空");
        }
        body = {
          action: "style-import",
          cwd: activeCwd,
          args: {
            bookId: activeBookId,
            from: stylePath.trim(),
            name: name,
            json: true
          }
        };
      }

      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("响应正文流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: { success: boolean; stdout?: string; stderr?: string; error?: string } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === "stdout" || chunk.type === "stderr") {
              setStyleLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (err) {}
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (err) {}
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || "文风导入执行失败，请检查路径或日志。");
      }

      setStyleSuccessText(`🎉 成功完成文风克隆分析！统计学特征已存入 style_profile.json，大模型文风提示词已写入 style_guide.md。后续写作 AI 将会自动参照该文风书写。`);
      
      const fullGuidePath = joinFilePath(activeCwd, `books/${activeBookId}/story/style_guide.md`);
      setStyleGuidePath(fullGuidePath);

      // Refresh explorer tree
      await checkWorkspaceStatus(activeCwd);
      setExplorerKey((k) => k + 1);
      window.dispatchEvent(new CustomEvent("refresh-explorer"));
    } catch (err: any) {
      console.error(err);
      setStyleError(err.message || "文风导入执行失败，请重试。");
    } finally {
      setIsCloning(false);
    }
  };

  const handleStyleSwitch = async (styleName: string) => {
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd || !activeBookId) return;

    setIsStyleSwitching(true);
    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "style-switch",
          cwd: activeCwd,
          args: { bookId: activeBookId, styleName }
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP error ${res.status}`);
      }
      if (onStylesChange) {
        onStylesChange(availableStyles, styleName);
      }
      setExplorerKey((k) => k + 1);
    } catch (err: any) {
      alert(`切换文风失败: ${err.message || err}`);
    } finally {
      setIsStyleSwitching(false);
    }
  };

  useEffect(() => {
    onWorkspaceStatusChange?.(isInkosWorkspace, hasBooks);
  }, [isInkosWorkspace, hasBooks, onWorkspaceStatusChange]);

  useEffect(() => {
    const handleTriggerStyleClone = () => {
      setIsStyleModalOpen(true);
      setStyleSuccessText(null);
      setStyleError(null);
      setStyleLogs([]);
      setStyleName("");
      setStyleText("");
      setStylePath("");
      setStyleGuidePath(null);
    };

    const handleTriggerRadar = () => {
      setIsRadarModalOpen(true);
      setRadarError(null);
      setRadarResult(null);
      setRadarLogs([]);
    };

    const handleTriggerStyleSwitch = (e: Event) => {
      const customEvent = e as CustomEvent<{ styleName: string }>;
      if (customEvent.detail && customEvent.detail.styleName) {
        handleStyleSwitch(customEvent.detail.styleName);
      }
    };

    window.addEventListener("trigger-style-clone", handleTriggerStyleClone);
    window.addEventListener("trigger-radar", handleTriggerRadar);
    window.addEventListener("trigger-style-switch", handleTriggerStyleSwitch);

    return () => {
      window.removeEventListener("trigger-style-clone", handleTriggerStyleClone);
      window.removeEventListener("trigger-radar", handleTriggerRadar);
      window.removeEventListener("trigger-style-switch", handleTriggerStyleSwitch);
    };
  }, [handleStyleSwitch]);

  const handleFanficRefresh = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd || !activeBookId) return;

    if (!fanficRefreshSource.trim()) {
      setFanficRefreshError("请输入原作素材的绝对路径");
      return;
    }

    setIsRefreshingCanon(true);
    setFanficRefreshError(null);
    setFanficRefreshSuccess(null);
    setFanficRefreshLogs([]);

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fanfic-refresh",
          cwd: activeCwd,
          args: {
            bookId: activeBookId,
            from: fanficRefreshSource.trim(),
            json: true,
          }
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }
      if (!res.body) {
        throw new Error("响应正文流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === "stdout" || chunk.type === "stderr") {
              setFanficRefreshLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (e) {}
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (e) {}
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || "刷新原作设定执行失败");
      }

      setFanficRefreshSuccess("同人原作正典设定已刷新！");
      setExplorerKey((k) => k + 1);
      window.dispatchEvent(new CustomEvent("refresh-explorer"));
    } catch (err: any) {
      console.error(err);
      setFanficRefreshError(err.message || String(err));
    } finally {
      setIsRefreshingCanon(false);
    }
  };

  const handlePlanBlueprint = async () => {
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd || !activeBookId) return;

    setIsWriteLoading(true);
    setWriteProgressText("正在为您规划首章蓝图，请稍候...");
    setWriteReportTitle("");
    setWriteReportContent("");
    setLogs([]);
    setWriteError(null);

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "plan",
          cwd: activeCwd,
          args: { bookId: activeBookId, json: true }
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("响应正文流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: { success: boolean; error?: string; stdout?: string; stderr?: string } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === "stdout" || chunk.type === "stderr") {
              const text = chunk.data || "";
              setLogs((prev) => [...prev, text]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (error) {
            console.error("Failed to parse stream chunk:", error);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch {}
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || "首章蓝图规划失败");
      }

      setWriteReportTitle("首章蓝图规划完成");
      setWriteReportContent("已成功规划首章大纲与大纲意图栈！\n已在 books/" + activeBookId + "/story/runtime/ 目录下生成了 chapter-0001.plan.md。接下来，您可以点击“智能写作”按钮以起草正文。");
      setIsWriteReportOpen(true);
      window.dispatchEvent(new CustomEvent("refresh-explorer"));
      await checkWorkspaceStatus(activeCwd);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setWriteError(message);
    } finally {
      setIsWriteLoading(false);
    }
  };

  const handleStartWriting = async () => {
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd || !activeBookId) return;

    setIsWriteLoading(true);
    setWriteProgressText("正在为您规划大纲并起草首章正文，请稍候...");
    setWriteReportTitle("");
    setWriteReportContent("");
    setLogs([]);

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "write-next",
          cwd: activeCwd,
          args: { bookId: activeBookId, json: true }
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("响应正文流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === "stdout" || chunk.type === "stderr") {
              const text = chunk.data || "";
              setLogs((prev) => [...prev, text]);

              if (text.includes("planning chapter") || text.includes("规划本章")) {
                setWriteProgressText("正在规划本章意图与章节规划栈...");
              } else if (text.includes("起草") || text.includes("drafting")) {
                setWriteProgressText("正在协同起草首章正文，请稍候...");
              } else if (text.includes("audit") || text.includes("审计")) {
                setWriteProgressText("正在执行离线审稿与一致性审计...");
              }
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (e) {
            console.error("Failed to parse stream chunk:", e);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (e) {}
      }

      if (!finalResult || !finalResult.success) {
        let errMsg = "";
        if (finalResult) {
          if (finalResult.error) {
            errMsg = finalResult.error;
          } else if (finalResult.stdout) {
            try {
              const parsed = JSON.parse(finalResult.stdout);
              if (parsed && parsed.error) {
                errMsg = parsed.error;
              } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[parsed.length - 1]?.error) {
                errMsg = parsed[parsed.length - 1].error;
              }
            } catch (e) {}
          }
          if (!errMsg && finalResult.stderr) {
            errMsg = finalResult.stderr.trim();
          }
        }
        throw new Error(errMsg || "首章创作执行失败");
      }

      let results: any[] = [];
      try {
        results = JSON.parse(finalResult.stdout);
      } catch (e) {
        console.error("Failed to parse write-next JSON output:", e);
        setWriteReportContent(finalResult.stdout || "首章起草成功！");
        setWriteReportTitle("首章起草完成");
        setIsWriteReportOpen(true);
        window.dispatchEvent(new CustomEvent("refresh-explorer"));
        await checkWorkspaceStatus(activeCwd);
        return;
      }

      const result = results[0];
      if (!result) {
        throw new Error("未返回有效的创作章节结果。");
      }

      const paddedNum = String(result.chapterNumber).padStart(4, "0");
      const chaptersDir = `${activeCwd}/books/${activeBookId}/chapters`;
      const listRes = await fetch(`/api/files/${encodeFilePathForApi(chaptersDir)}?type=list`);
      const listData = await listRes.json();
      const found = listData.entries?.find((e: any) => !e.isDir && e.name.startsWith(paddedNum));

      if (found) {
        const newFilePath = chaptersDir + "/" + found.name;
        window.dispatchEvent(new CustomEvent("open-file", {
          detail: { filePath: newFilePath, fileName: found.name }
        }));
      }

      const isPassed = result.auditResult?.passed ?? false;
      const issues = result.auditResult?.issues ?? [];
      const reportMarkdown = [
        `### 🎉 智能写作首章完成！`,
        "",
        `- **章节**: 第 ${result.chapterNumber} 章 《${result.title}》`,
        `- **字数**: ${result.wordCount} 字`,
        `- **自动修正**: ${result.revised ? "已执行（已修复关键问题）" : "无（无需修正）"}`,
        `- **状态结算**: \`${result.status}\``,
        "",
        `#### 🔍 离线审稿审计结果`,
        isPassed 
          ? "✅ **审计通过**：无逻辑矛盾或角色人设崩塌问题。" 
          : "⚠️ **审计未完全通过**：检测到一些逻辑或人设风险，建议审阅：",
        "",
        issues.length > 0
          ? issues.map((issue: any) => {
              const sev = String(issue.severity || "info").toLowerCase();
              const emojiPrefix = 
                (sev === "critical" || sev === "error") ? "🔴 [critical]" : 
                (sev === "warning") ? "🟡 [warning]" : 
                (sev === "info") ? "🔵 [info]" : `⚪ [${issue.severity}]`;
              return `- ${emojiPrefix} **${issue.category}**: ${issue.description}\n  *建议: ${issue.suggestion}*`;
            }).join("\n")
          : "*（无关键警告或错误）*"
      ].join("\n");

      setWriteReportTitle("首章创作与审计报告");
      setWriteReportContent(reportMarkdown);
      setIsWriteReportOpen(true);

      window.dispatchEvent(new CustomEvent("refresh-explorer"));
      await checkWorkspaceStatus(activeCwd);
      setIsWriteLoading(false);
    } catch (err: any) {
      console.error(err);
      const isTimeout = err.message.includes("超时") || err.message.includes("timed out") || logs.some(l => l.includes("超时"));
      if (isTimeout) {
        setWriteError("任务运行超时（已超过 1800 秒）。建议在右上角「模型配置」中，更换速度较快且稳定的标准模型（例如将 reasoning/思索模型切换为标准对话模型），并检查您的 API Key 与接口代理连接状态。");
      } else {
        setWriteError(err.message || String(err));
      }
    }
  };

  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitle.trim()) {
      setBookError("书籍名称不能为空");
      return;
    }
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd) return;

    setIsCreatingBook(true);
    setBookError(null);

    try {
      const isFanficGenre = bookGenre === "fanfic";
      if (isFanficGenre && !fanficSource.trim()) {
        throw new Error("同人小说原作素材磁盘路径不能为空");
      }

      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isFanficGenre ? "fanfic-init" : "book-create",
          cwd: activeCwd,
          args: isFanficGenre ? {
            title: bookTitle.trim(),
            from: fanficSource.trim(),
            mode: fanficMode,
            genre: "fanfic",
            platform: bookPlatform,
            json: true,
          } : {
            title: bookTitle.trim(),
            genre: bookGenre,
            platform: bookPlatform,
            brief: bookBrief.trim() || undefined,
            selectedFrameworkPath: (detectedFramework && useFramework) ? detectedFramework.fullPath : undefined,
            selectedCharacterPath: (detectedCharacter && useCharacter) ? detectedCharacter.fullPath : undefined,
          }
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("响应正文流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: { success: boolean; error?: string } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (err) {}
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (err) {}
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || "创建书籍失败，大模型生成异常，请检查配置和 Key");
      }

      await checkWorkspaceStatus(activeCwd);
      setExplorerKey((k) => k + 1);
      
      setBookTitle("");
      setBookBrief("");
      setFanficSource("");
      setIsBookModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setBookError(err.message || "创建书籍失败，请确认侧边栏左下角 Models 中 API Key 填写正确且模型支持当前题材生成。");
    } finally {
      setIsCreatingBook(false);
    }
  };

  const handleDeleteBook = async () => {
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd || !activeBookId) return;

    setIsDeletingBook(true);
    setDeleteBookError(null);

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "book-delete",
          cwd: activeCwd,
          args: {
            bookId: activeBookId,
            json: true,
          }
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("响应正文流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: { success: boolean; error?: string } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (err) {}
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (err) {}
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || "删除书籍失败");
      }

      // Close all open tabs for this book in the editor
      window.dispatchEvent(new CustomEvent("close-directory", {
        detail: { dirPath: `${activeCwd}/books/${activeBookId}` }
      }));

      // Refresh workspace available books
      await checkWorkspaceStatus(activeCwd);
      setExplorerKey((k) => k + 1);
      setIsDeleteBookModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setDeleteBookError(err.message || "删除书籍失败");
    } finally {
      setIsDeletingBook(false);
    }
  };

  const handleRadarScan = async (e: React.FormEvent) => {

    e.preventDefault();
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd) return;

    setIsScanningRadar(true);
    setRadarError(null);
    setRadarResult(null);
    setRadarLogs([]);

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "radar-scan",
          cwd: activeCwd,
          args: { json: true }
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("响应流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: { success: boolean; error?: string; stdout?: string; stderr?: string } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === "stdout" || chunk.type === "stderr") {
              setRadarLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (error) {
            console.error("Failed to parse stream chunk:", error);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch {}
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || "扫描市场情报失败");
      }

      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(finalResult.stdout || "");
      } catch (error) {
        console.error("Failed to parse radar scan result JSON:", error);
      }

      if (parsed) {
        setRadarResult(parsed);
      } else {
        throw new Error("检测引擎未返回有效的 JSON 结构");
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setRadarError(message);
    } finally {
      setIsScanningRadar(false);
    }
  };

  const handleShortRunStep = async (stepStage: "outline" | "draft" | "package") => {
    if (!shortDirection.trim()) {
      setShortError("创作方向不能为空");
      return;
    }
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd) return;

    setIsRunningShort(true);
    setShortError(null);
    setShortSuccess(null);
    setShortLogs([]);

    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "short-run",
          cwd: activeCwd,
          args: {
            direction: shortDirection.trim(),
            chapters: shortChapters,
            chars: shortChars,
            noCover: !shortCover,
            json: true,
            stage: stepStage,
            storyId: shortStoryId || undefined,
          }
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("响应流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: { success: boolean; error?: string; stdout?: string; stderr?: string } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === "stdout" || chunk.type === "stderr") {
              setShortLogs((prev) => [...prev, chunk.data || ""]);
            } else if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (error) {
            console.error("Failed to parse stream chunk:", error);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch {}
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || `${stepStage === "outline" ? "大纲规划" : stepStage === "draft" ? "正文写作" : "封面与包装"} 阶段任务执行失败`);
      }

      let parsed: { storyId?: string } | null = null;
      try {
        parsed = JSON.parse(finalResult.stdout || "");
      } catch (error) {
        console.error("Failed to parse short fiction result JSON:", error);
      }

      if (parsed && parsed.storyId) {
        setShortStoryId(parsed.storyId);
        if (stepStage === "outline") {
          setShortSuccess(`【第一步：生成大纲】执行完成！故事 ID 为: ${parsed.storyId}\n大纲与大纲评审文件已输出至 shorts/${parsed.storyId}/outline/v002.md，请查阅无误后点击下方【第二步】开始起草章节。`);
          setShortFictionStage("draft");
        } else if (stepStage === "draft") {
          setShortSuccess(`【第二步：批量起草】执行完成！故事 ID 为: ${parsed.storyId}\n所有章节的初稿已经全部起草完毕，文件输出在 shorts/${parsed.storyId}/final/full.md。点击下方【第三步】即可一键打包与制作封面。`);
          setShortFictionStage("package");
        } else if (stepStage === "package") {
          setShortSuccess(`【第三步：生成书封包装】执行完成！\n故事销售包装和封面图文件已成功生成。至此，该短篇小说已全部创作完毕！`);
          setShortFictionStage("completed");
        }
        window.dispatchEvent(new CustomEvent("refresh-explorer"));
        await checkWorkspaceStatus(activeCwd);
      } else {
        setShortSuccess(`全自动短篇生成运行完成！已将成果输出至 shorts/ 目录下，请检查文件浏览器。`);
        window.dispatchEvent(new CustomEvent("refresh-explorer"));
        await checkWorkspaceStatus(activeCwd);
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setShortError(message);
    } finally {
      setIsRunningShort(false);
    }
  };

  const handleInitWorkspace = async () => {
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd) return;
    setIsInitializing(true);
    setInitError(null);
    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init", cwd: activeCwd }),
      });

      if (!res.ok) {
        throw new Error(`HTTP 异常 ${res.status}`);
      }

      if (!res.body) {
        throw new Error("响应正文流为空");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: { success: boolean; error?: string } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === "result") {
              finalResult = chunk;
            }
          } catch (err) {}
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.type === "result") finalResult = chunk;
        } catch (err) {}
      }

      if (!finalResult || !finalResult.success) {
        throw new Error(finalResult?.error || "Failed to initialize workspace");
      }

      await checkWorkspaceStatus(activeCwd);
      setExplorerKey((k) => k + 1); // trigger file explorer refresh
    } catch (err: any) {
      console.error(err);
      setInitError(err.message || "初始化失败");
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    const activeCwd = selectedCwdProp || selectedCwd;
    if (activeCwd) {
      fetch("/api/register-cwd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: activeCwd })
      })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to register CWD");
        return res.json();
      })
      .then(() => {
        setRegisteredCwd(activeCwd);
        checkWorkspaceStatus(activeCwd);
      })
      .catch((err) => {
        console.error("CWD registration failed:", err);
        setRegisteredCwd(activeCwd);
        checkWorkspaceStatus(activeCwd);
      });
    } else {
      setRegisteredCwd(null);
      setIsInkosWorkspace(true);
    }
  }, [selectedCwdProp, selectedCwd, checkWorkspaceStatus, explorerKey]);

  // Load Gems
  const loadGems = useCallback(async () => {
    try {
      const res = await fetch("/api/gem-xy");
      if (!res.ok) throw new Error("Failed to load Gem-xY profiles");
      const data = await res.json() as GemProfile[];
      setGems(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadGems();
  }, [loadGems]);

  // Load Models List (for editor configuration)
  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((d: { modelList?: { id: string; name: string; provider: string }[]; defaultModel?: { provider: string; modelId: string } | null }) => {
        if (d.modelList) setModelList(d.modelList);
        if (d.defaultModel) setDefaultModel(d.defaultModel);
      })
      .catch(() => {});
  }, []);

  const handleSelectGem = useCallback((gemId: string) => {
    if (!selectedCwd) return;
    const tempId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    onNewSession?.(tempId, selectedCwd, gemId);
  }, [selectedCwd, onNewSession]);

  const handleDeleteGem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("确定要删除这个智能体吗？")) return;
    try {
      const res = await fetch(`/api/gem-xy/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      loadGems();
    } catch (err) {
      console.error(err);
      alert("删除失败");
    }
  };
  const [sessionRefreshDone, setSessionRefreshDone] = useState(false);
  const [explorerRefreshDone, setExplorerRefreshDone] = useState(false);
  const sessionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explorerRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSessions = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { sessions: SessionInfo[] };
      setAllSessions(data.sessions);
      setError(null);
      if (!showLoading) {
        setSessionRefreshDone(true);
        if (sessionRefreshTimerRef.current) clearTimeout(sessionRefreshTimerRef.current);
        sessionRefreshTimerRef.current = setTimeout(() => setSessionRefreshDone(false), 2000);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    const isFirst = !initialLoadDone.current;
    initialLoadDone.current = true;
    loadSessions(isFirst);
  }, [loadSessions, refreshKey]);

  useEffect(() => {
    if (explorerRefreshKey !== undefined) setExplorerKey((k) => k + 1);
  }, [explorerRefreshKey]);

  useEffect(() => {
    fetch("/api/home").then((r) => r.json()).then((d: { home?: string }) => {
      if (d.home) setHomeDir(d.home);
    }).catch(() => {});
  }, []);

  const restoredRef = useRef(false);

  useEffect(() => {
    onCwdChange?.(selectedCwd);
  }, [selectedCwd, onCwdChange]);

  // Save selected Cwd to localStorage for persistence
  useEffect(() => {
    if (!selectedCwd) return;
    try {
      const stored = localStorage.getItem("ink-xy-recent-cwds");
      let list: string[] = [];
      if (stored) {
        list = JSON.parse(stored);
      }
      if (!Array.isArray(list)) list = [];
      const updated = [selectedCwd, ...list.filter((c) => c !== selectedCwd)].slice(0, 10);
      localStorage.setItem("ink-xy-recent-cwds", JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save recent CWD to localStorage:", e);
    }
  }, [selectedCwd]);

  // Check existence of recent cwds whenever allSessions, selectedCwd, or explorerKey changes
  useEffect(() => {
    const rawCwds = getRecentCwds(allSessions);
    let customCwds: string[] = [];
    try {
      const stored = localStorage.getItem("ink-xy-recent-cwds");
      if (stored) {
        customCwds = JSON.parse(stored);
      }
    } catch (e) {}
    if (!Array.isArray(customCwds)) customCwds = [];

    // Filter out deleted/excluded CWDs
    let deletedCwds: string[] = [];
    try {
      const deletedStored = localStorage.getItem("ink-xy-deleted-cwds");
      if (deletedStored) {
        deletedCwds = JSON.parse(deletedStored);
      }
    } catch (e) {}
    if (!Array.isArray(deletedCwds)) deletedCwds = [];

    const combined = [...new Set([...rawCwds, ...customCwds])].filter(
      (c) => !deletedCwds.includes(c)
    );

    if (combined.length === 0) {
      setValidRecentCwds([]);
      setRecentCwdsChecked(true);
      return;
    }
    const checkAll = async () => {
      // First, register them with the backend so they are in allowed roots
      try {
        await fetch("/api/register-cwd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cwds: combined })
        });
      } catch (e) {
        console.error("Failed to register combined CWDs:", e);
      }

      const results = await Promise.all(
        combined.map(async (cwd) => {
          try {
            const res = await fetch(`/api/files/${encodeFilePathForApi(cwd)}?type=list&check=true`);
            if (res.ok) {
              const data = await res.json();
              return { cwd, exists: data.exists !== false };
            }
          } catch (e) {}
          return { cwd, exists: false };
        })
      );
      const valid = results.filter(r => r.exists).map(r => r.cwd);
      setValidRecentCwds(valid);
      setRecentCwdsChecked(true);
    };
    checkAll();
  }, [allSessions, selectedCwd, explorerKey]);

  // Auto-select cwd and restore session from URL on first load
  useEffect(() => {
    if (allSessions.length === 0) return;

    if (selectedCwd === null) {
      // If restoring a session, set cwd to match that session
      if (initialSessionId && !restoredRef.current) {
        restoredRef.current = true;
        const target = allSessions.find((s) => s.id === initialSessionId);
        if (target) {
          setSelectedCwd(target.cwd);
          onSelectSession(target, true);
          return;
        }
        // Session not found — notify parent so it can show the placeholder
        onInitialRestoreDone?.();
      }

      if (recentCwdsChecked) {
        if (validRecentCwds.length > 0) {
          setSelectedCwd(validRecentCwds[0]);
        } else {
          // Fallback: try to fetch default CWD
          fetch("/api/default-cwd", { method: "POST" })
            .then((res) => res.json())
            .then((data: any) => {
              if (data.cwd) {
                setSelectedCwd(data.cwd);
              }
            })
            .catch(() => {});
        }
      }
    }
  }, [allSessions, selectedCwd, initialSessionId, onSelectSession, onInitialRestoreDone, validRecentCwds, recentCwdsChecked]);

  const commitCustomPath = useCallback(() => {
    const path = customPathValue.trim();
    if (path) {
      setSelectedCwd(path);
      // Remove from deleted list if they manually re-added it
      try {
        const deletedStored = localStorage.getItem("ink-xy-deleted-cwds");
        if (deletedStored) {
          let deletedList: string[] = JSON.parse(deletedStored);
          if (Array.isArray(deletedList) && deletedList.includes(path)) {
            deletedList = deletedList.filter((c) => c !== path);
            localStorage.setItem("ink-xy-deleted-cwds", JSON.stringify(deletedList));
          }
        }
      } catch (e) {
        console.error("Failed to remove re-added path from deleted list:", e);
      }
    }
    setCustomPathOpen(false);
    setCustomPathValue("");
    setDropdownOpen(false);
  }, [customPathValue]);

  const handleDefaultCwd = useCallback(async () => {
    try {
      const res = await fetch("/api/default-cwd", { method: "POST" });
      const data = await res.json() as { cwd?: string; error?: string };
      if (data.cwd) {
        setSelectedCwd(data.cwd);
        setDropdownOpen(false);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleDeleteRecentCwd = useCallback((cwdToDelete: string) => {
    // 1. Add to deleted/excluded CWDs list in localStorage
    try {
      const deletedStored = localStorage.getItem("ink-xy-deleted-cwds");
      let deletedList: string[] = [];
      if (deletedStored) deletedList = JSON.parse(deletedStored);
      if (!Array.isArray(deletedList)) deletedList = [];
      if (!deletedList.includes(cwdToDelete)) {
        deletedList.push(cwdToDelete);
        localStorage.setItem("ink-xy-deleted-cwds", JSON.stringify(deletedList));
      }
    } catch (e) {
      console.error("Failed to update deleted CWDs list:", e);
    }

    // 2. Remove from ink-xy-recent-cwds in localStorage
    try {
      const stored = localStorage.getItem("ink-xy-recent-cwds");
      if (stored) {
        let list: string[] = JSON.parse(stored);
        if (Array.isArray(list)) {
          const updated = list.filter((c) => c !== cwdToDelete);
          localStorage.setItem("ink-xy-recent-cwds", JSON.stringify(updated));
        }
      }
    } catch (e) {
      console.error("Failed to remove CWD from localStorage:", e);
    }

    // 3. Update the state to immediately reflect the deletion in the UI
    setValidRecentCwds((prev) => prev.filter((c) => c !== cwdToDelete));

    // 4. If the deleted path was currently selected, select another one or fallback
    const activeCwd = selectedCwdProp || selectedCwd;
    if (activeCwd === cwdToDelete) {
      const remaining = validRecentCwds.filter((c) => c !== cwdToDelete);
      if (remaining.length > 0) {
        setSelectedCwd(remaining[0]);
      } else {
        handleDefaultCwd();
      }
    }
  }, [validRecentCwds, selectedCwdProp, selectedCwd, handleDefaultCwd]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setCustomPathOpen(false);
        setCustomPathValue("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleNewSession = useCallback(() => {
    if (!selectedCwd) return;
    // Generate a temporary UUID client-side — no backend call needed.
    // Pi will be spawned lazily when the user sends the first message.
    const tempId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    onNewSession?.(tempId, selectedCwd);
  }, [selectedCwd, onNewSession]);

  const filteredSessions = selectedCwd
    ? allSessions.filter((s) => s.cwd === selectedCwd)
    : allSessions;

  // Build parent-child tree within the filtered set
  const sessionTree = buildSessionTree(filteredSessions);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          padding: "12px 10px 10px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <StudioTitle />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={handleNewSession}
              disabled={!selectedCwd}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                background: "var(--bg-hover)",
                border: "1px solid var(--border)",
                color: selectedCwd ? "var(--text-muted)" : "var(--text-dim)",
                cursor: selectedCwd ? "pointer" : "not-allowed",
                height: 32,
                paddingLeft: 10,
                paddingRight: 12,
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "-0.01em",
                flexShrink: 0,
                transition: "background 0.12s, color 0.12s, border-color 0.12s",
              }}
              title={selectedCwd ? `在新协同会话中写作` : "请先选择创作工作区"}
              onMouseEnter={(e) => {
                if (!selectedCwd) return;
                e.currentTarget.style.background = "var(--bg-selected)";
                e.currentTarget.style.color = "var(--accent)";
                e.currentTarget.style.borderColor = "rgba(37,99,235,0.35)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = selectedCwd ? "var(--text-muted)" : "var(--text-dim)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="6" y1="1" x2="6" y2="11" />
                <line x1="1" y1="6" x2="11" y2="6" />
              </svg>
              新会话
            </button>
            <button
              onClick={() => loadSessions(false)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                background: sessionRefreshDone ? "rgba(74,222,128,0.18)" : "var(--bg-hover)",
                border: `1px solid ${sessionRefreshDone ? "rgba(74,222,128,0.4)" : "var(--border)"}`,
                color: sessionRefreshDone ? "#4ade80" : "var(--text-muted)",
                cursor: "pointer",
                width: 32, height: 32,
                borderRadius: 7,
                padding: 0,
                flexShrink: 0,
                transition: "background 0.3s, color 0.3s, border-color 0.3s",
              }}
              onMouseEnter={(e) => {
                if (sessionRefreshDone) return;
                e.currentTarget.style.background = "var(--bg-selected)";
                e.currentTarget.style.color = "var(--accent)";
                e.currentTarget.style.borderColor = "rgba(37,99,235,0.35)";
              }}
              onMouseLeave={(e) => {
                if (sessionRefreshDone) return;
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
              title="刷新会话"
            >
              {sessionRefreshDone ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* CWD picker */}
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              padding: "6px 10px",
              background: selectedCwd ? "var(--bg-hover)" : "rgba(37,99,235,0.06)",
              border: selectedCwd ? "1px solid var(--border)" : "1px solid rgba(37,99,235,0.4)",
              borderRadius: 7,
              cursor: "pointer",
              fontSize: 12,
              color: "var(--text)",
              textAlign: "left",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: selectedCwd ? "var(--text)" : "var(--text-dim)",
              }}
              title={selectedCwd ?? ""}
            >
              {selectedCwd ? shortenCwd(selectedCwd, homeDir) : (initialSessionId && !restoredRef.current ? "" : "选择创作目录…")}
            </span>
          </button>

          {dropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                right: 0,
                zIndex: 100,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                boxShadow: "0 6px 20px rgba(0,0,0,0.10)",
                overflow: "hidden",
              }}
            >
              {validRecentCwds.map((cwd) => (
                <div
                  key={cwd}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    background: cwd === selectedCwd ? "var(--bg-selected)" : "none",
                    borderBottom: "1px solid var(--border)",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (cwd !== selectedCwd) {
                      e.currentTarget.style.background = "var(--bg-panel)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (cwd !== selectedCwd) {
                      e.currentTarget.style.background = "none";
                    }
                  }}
                >
                  <button
                    onClick={() => {
                      setSelectedCwd(cwd);
                      setCustomPathOpen(false);
                      setCustomPathValue("");
                      setDropdownOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      flex: 1,
                      padding: "8px 10px",
                      background: "none",
                      border: "none",
                      color: cwd === selectedCwd ? "var(--text)" : "var(--text-muted)",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={cwd}
                  >
                    {cwd === selectedCwd && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polyline points="1.5 5 4 7.5 8.5 2.5" />
                      </svg>
                    )}
                    {cwd !== selectedCwd && <span style={{ width: 10, flexShrink: 0 }} />}
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortenCwd(cwd, homeDir)}</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRecentCwd(cwd);
                    }}
                    title="从列表中移除该路径"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 20,
                      height: 20,
                      marginRight: 6,
                      background: "none",
                      border: "none",
                      color: "var(--text-dim)",
                      cursor: "pointer",
                      borderRadius: 4,
                      transition: "color 0.2s, background 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#ef4444";
                      e.currentTarget.style.background = "rgba(239, 68, 68, 0.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--text-dim)";
                      e.currentTarget.style.background = "none";
                    }}
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}

              {/* Default cwd shortcut */}
              {!customPathOpen && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDefaultCwd(); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    width: "100%",
                    padding: "8px 10px",
                    background: "none",
                    border: "none",
                    borderTop: validRecentCwds.length > 0 ? "1px solid var(--border)" : "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 11,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
                  </svg>
                  <span>使用默认创作目录</span>
                </button>
              )}

              {/* Custom path entry */}
              {!customPathOpen ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCustomPathOpen(true);
                    setTimeout(() => customPathInputRef.current?.focus(), 0);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    width: "100%",
                    padding: "8px 10px",
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 11,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" style={{ flexShrink: 0 }}>
                    <line x1="5" y1="1" x2="5" y2="9" />
                    <line x1="1" y1="5" x2="9" y2="5" />
                  </svg>
                  <span>自定义路径…</span>
                </button>
              ) : (
                <div style={{ padding: "6px 8px", borderTop: validRecentCwds.length > 0 ? "none" : undefined }}>
                  <input
                    ref={customPathInputRef}
                    value={customPathValue}
                    onChange={(e) => setCustomPathValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitCustomPath();
                      if (e.key === "Escape") {
                        setCustomPathOpen(false);
                        setCustomPathValue("");
                      }
                    }}
                    placeholder="/path/to/project"
                    style={{
                      width: "100%",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      padding: "5px 8px",
                      border: "1px solid var(--accent)",
                      borderRadius: 5,
                      outline: "none",
                      background: "var(--bg)",
                      color: "var(--text)",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                    <button
                      onClick={commitCustomPath}
                      style={{
                        flex: 1,
                        padding: "4px 0",
                        background: "var(--accent)",
                        border: "none",
                        borderRadius: 5,
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      打开
                    </button>
                    <button
                      onClick={() => { setCustomPathOpen(false); setCustomPathValue(""); }}
                      style={{
                        flex: 1,
                        padding: "4px 0",
                        background: "var(--bg-hover)",
                        border: "1px solid var(--border)",
                        borderRadius: 5,
                        color: "var(--text-muted)",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* File Explorer section (workspace assets tree, elevated to be the main focus) */}
      {(selectedCwdProp || selectedCwd) && (
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            flex: explorerOpen ? "1 1 0" : "0 0 auto",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <button
              onClick={() => setExplorerOpen((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flex: 1,
                padding: "8px 10px",
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                textAlign: "left",
              }}
            >
              <svg
                width="9" height="9" viewBox="0 0 10 10" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: explorerOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}
              >
                <polyline points="3 2 7 5 3 8" />
              </svg>
              创作目录 (Workspace)
            </button>
            {isInkosWorkspace && (
              <div style={{ display: "flex", gap: 2 }}>
                {hasBooks && (
                  <button
                    onClick={() => {
                      setIsExportModalOpen(true);
                      setExportSuccessText(null);
                      setExportError(null);
                      setExportLogs([]);
                    }}
                    title="导出小说书稿 (Export Book)"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 26, height: 26, padding: 0,
                      background: "none",
                      border: "none",
                      color: "var(--text-dim)",
                      cursor: "pointer",
                      borderRadius: 5,
                      flexShrink: 0,
                      transition: "color 0.3s, background 0.3s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none"; }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </button>
                )}
                {isFanfic && (
                  <button
                    onClick={() => {
                      setIsFanficRefreshModalOpen(true);
                      setFanficRefreshSuccess(null);
                      setFanficRefreshError(null);
                      setFanficRefreshLogs([]);
                      setFanficRefreshSource("");
                    }}
                    title="刷新同人原作背景设定 (Refresh Fanfic Canon)"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 26, height: 26, padding: 0,
                      background: "none",
                      border: "none",
                      color: "var(--text-dim)",
                      cursor: "pointer",
                      borderRadius: 5,
                      flexShrink: 0,
                      transition: "color 0.3s, background 0.3s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none"; }}
                  >
                    <span style={{ fontSize: 13 }}>🎬</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsImportModalOpen(true);
                    setImportSuccessText(null);
                    setImportError(null);
                    setImportLogs([]);
                    setImportFromPath("");
                    setImportSplitRegex("");
                    setImportResumeFrom("");
                    setImportIsSeries(false);
                    setImportBookSelection(availableBooks.length > 0 ? "active" : "new");
                    setNewBookId("");
                    setNewBookTitle("");
                    const otherBook = availableBooks.find((b) => b !== activeBookId) || "";
                    setImportCanonFromBookId(otherBook);
                  }}
                  title="导入设定或旧章原稿 (Import Canon/Chapters)"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 26, height: 26, padding: 0, marginRight: 6,
                    background: "none",
                    border: "none",
                    color: "var(--text-dim)",
                    cursor: "pointer",
                    borderRadius: 5,
                    flexShrink: 0,
                    transition: "color 0.3s, background 0.3s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none"; }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              </div>
            )}
            <button
              onClick={() => {
                setExplorerKey((k) => k + 1);
                setExplorerRefreshDone(true);
                if (explorerRefreshTimerRef.current) clearTimeout(explorerRefreshTimerRef.current);
                explorerRefreshTimerRef.current = setTimeout(() => setExplorerRefreshDone(false), 2000);
              }}
              title="刷新创作目录"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 26, height: 26, padding: 0, marginRight: 6,
                background: explorerRefreshDone ? "rgba(74,222,128,0.18)" : "none",
                border: "none",
                color: explorerRefreshDone ? "#4ade80" : "var(--text-dim)",
                cursor: "pointer",
                borderRadius: 5,
                flexShrink: 0,
                transition: "color 0.3s, background 0.3s",
              }}
              onMouseEnter={(e) => { if (explorerRefreshDone) return; e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { if (explorerRefreshDone) return; e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none"; }}
            >
              {explorerRefreshDone ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              )}
            </button>
          </div>
          {explorerOpen && (
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
              {!isInkosWorkspace && (
                <div style={{
                  margin: "8px 10px",
                  padding: "12px",
                  background: "var(--bg-panel)",
                  border: "1px dashed var(--accent)",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontFamily: "var(--font-serif)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                    <span style={{ fontSize: 13 }}>✒️</span>
                    <span>未初始化的创作空间</span>
                  </div>
                  <div style={{ color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 8 }}>
                    该目录尚未创建 InkOS 小说项目结构。一键初始化以启用自动章节规划、人设审计与快照防崩系统。
                  </div>
                  {initError && (
                    <div style={{ color: "#ef4444", marginBottom: 8, fontSize: 10 }}>
                      ⚠️ {initError}
                    </div>
                  )}
                  <button
                    onClick={handleInitWorkspace}
                    disabled={isInitializing}
                    style={{
                      width: "100%",
                      padding: "6px 0",
                      background: "var(--accent)",
                      border: "none",
                      borderRadius: "6px",
                      color: "white",
                      fontWeight: 600,
                      cursor: isInitializing ? "not-allowed" : "pointer",
                      opacity: isInitializing ? 0.7 : 1,
                      textAlign: "center",
                      transition: "opacity 0.15s",
                    }}
                  >
                    {isInitializing ? "正在开启小说宇宙..." : "一键开启创作宇宙"}
                  </button>
                </div>
              )}
              {isInkosWorkspace && (
                <div style={{
                  margin: "8px 10px",
                  padding: "12px",
                  background: "var(--bg-panel)",
                  border: "1px dashed var(--accent)",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontFamily: "var(--font-serif)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                    <span style={{ fontSize: 13 }}>📚</span>
                    <span>{hasBooks ? "创建新小说书籍" : "小说宇宙内尚无书籍"}</span>
                  </div>
                  <div style={{ color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 8 }}>
                    {hasBooks
                      ? "在当前创作宇宙中创建另一本新书。新书将拥有独立的设定大纲、章节规划和人设体系。"
                      : "在 InkOS 中，设定与大纲是以“书籍”为单位存储的。立即创建您的第一本书，AI 架构师将为您搭建创作地基。"}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button
                      onClick={() => setIsBookModalOpen(true)}
                      style={{
                        flex: 1,
                        padding: "6px 0",
                        background: "var(--accent)",
                        border: "none",
                        borderRadius: "6px",
                        color: "white",
                        fontWeight: 600,
                        cursor: "pointer",
                        textAlign: "center",
                        fontSize: "11px",
                        transition: "opacity 0.15s",
                      }}
                    >
                      {hasBooks ? "➕ 创建新书籍" : "✍️ 创建小说书籍"}
                    </button>
                    {!hasBooks && showImportDraft && (
                      <button
                        onClick={() => {
                          setIsImportModalOpen(true);
                          setImportSuccessText(null);
                          setImportError(null);
                          setImportLogs([]);
                          setImportFromPath("");
                          setImportSplitRegex("");
                          setImportResumeFrom("");
                          setImportIsSeries(false);
                          setImportBookSelection("new");
                          setNewBookId("");
                          setNewBookTitle("");
                          const otherBook = availableBooks.find((b) => b !== activeBookId) || "";
                          setImportCanonFromBookId(otherBook);
                        }}
                        style={{
                          flex: 1,
                          padding: "6px 0",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          color: "var(--text)",
                          fontWeight: 600,
                          cursor: "pointer",
                          textAlign: "center",
                          fontSize: "11px",
                          transition: "opacity 0.15s",
                        }}
                      >
                        📥 导入已有旧稿
                      </button>
                    )}
                  </div>
                  {!hasBooks && showAutoGenerateShort && (
                    <button
                      onClick={() => {
                        setIsShortRunModalOpen(true);
                        setShortError(null);
                        setShortSuccess(null);
                        setShortLogs([]);
                        setShortDirection("");
                        setShortChapters(12);
                        setShortChars(1000);
                        setShortCover(true);
                      }}
                      style={{
                        width: "100%",
                        marginTop: 8,
                        padding: "6px 0",
                        background: "rgba(139, 92, 246, 0.08)",
                        border: "1px solid rgba(139, 92, 246, 0.3)",
                        borderRadius: "6px",
                        color: "#a78bfa",
                        fontWeight: 600,
                        cursor: "pointer",
                        textAlign: "center",
                        fontSize: "11px",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(139, 92, 246, 0.16)";
                        e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.5)";
                        e.currentTarget.style.color = "#c084fc";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(139, 92, 246, 0.08)";
                        e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.3)";
                        e.currentTarget.style.color = "#a78bfa";
                      }}
                    >
                      🚀 一键全自动生成短篇
                    </button>
                  )}
                </div>
              )}
              {isInkosWorkspace && hasBooks && !hasChapters && (
                <div style={{
                  margin: "8px 10px",
                  padding: "12px",
                  background: "var(--bg-panel)",
                  border: "1px dashed var(--accent)",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontFamily: "var(--font-serif)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                    <span style={{ fontSize: 13 }}>✍️</span>
                    <span>书籍已创建，准备开始首章创作</span>
                  </div>
                  <div style={{ color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 8 }}>
                    {hasFirstChapterBlueprint 
                      ? "第一章蓝图已规划完成！点击下方按钮，由 AI 协同起草第一章正文，拉开故事序幕。"
                      : "您的创作宇宙和人设基础已准备就绪！开始写作前，请先点击下方按钮规划首章蓝图，确立开篇方向。"}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    {!hasFirstChapterBlueprint ? (
                      <button
                        onClick={handlePlanBlueprint}
                        disabled={isWriteLoading}
                        style={{
                          flex: 1,
                          padding: "6px 0",
                          background: "var(--accent)",
                          border: "none",
                          borderRadius: "6px",
                          color: "white",
                          fontWeight: 600,
                          cursor: isWriteLoading ? "not-allowed" : "pointer",
                          textAlign: "center",
                          fontSize: "11px",
                          transition: "opacity 0.15s",
                        }}
                      >
                        🗺️ 规划首章蓝图
                      </button>
                    ) : (
                      <button
                        onClick={handleStartWriting}
                        disabled={isWriteLoading}
                        style={{
                          flex: 1,
                          padding: "6px 0",
                          background: "var(--accent)",
                          border: "none",
                          borderRadius: "6px",
                          color: "white",
                          fontWeight: 600,
                          cursor: isWriteLoading ? "not-allowed" : "pointer",
                          textAlign: "center",
                          fontSize: "11px",
                          transition: "opacity 0.15s",
                        }}
                      >
                        ✍️ 智能写作
                      </button>
                    )}
                    {showImportDraft && (
                      <button
                        onClick={() => {
                          setIsImportModalOpen(true);
                          setImportSuccessText(null);
                          setImportError(null);
                          setImportLogs([]);
                          setImportFromPath("");
                          setImportSplitRegex("");
                          setImportResumeFrom("");
                          setImportIsSeries(false);
                          const otherBook = availableBooks.find((b) => b !== activeBookId) || "";
                          setImportCanonFromBookId(otherBook);
                        }}
                        disabled={isWriteLoading}
                        style={{
                          flex: 1,
                          padding: "6px 0",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          color: "var(--text)",
                          fontWeight: 600,
                          cursor: isWriteLoading ? "not-allowed" : "pointer",
                          textAlign: "center",
                          fontSize: "11px",
                          transition: "opacity 0.15s",
                        }}
                      >
                        📥 导入已有旧稿
                      </button>
                    )}
                  </div>
                  {showAutoGenerateShort && (
                    <button
                      onClick={() => {
                        setIsShortRunModalOpen(true);
                        setShortError(null);
                        setShortSuccess(null);
                        setShortLogs([]);
                        setShortDirection("");
                        setShortChapters(12);
                        setShortChars(1000);
                        setShortCover(true);
                      }}
                      style={{
                        width: "calc(100% - 20px)",
                        margin: "8px 10px 0 10px",
                        padding: "6px 0",
                        background: "rgba(139, 92, 246, 0.08)",
                        border: "1px solid rgba(139, 92, 246, 0.3)",
                        borderRadius: "6px",
                        color: "#a78bfa",
                        fontWeight: 600,
                        cursor: "pointer",
                        textAlign: "center",
                        fontSize: "11px",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(139, 92, 246, 0.16)";
                        e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.5)";
                        e.currentTarget.style.color = "#c084fc";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(139, 92, 246, 0.08)";
                        e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.3)";
                        e.currentTarget.style.color = "#a78bfa";
                      }}
                    >
                      🚀 一键全自动生成短篇
                    </button>
                  )}
                </div>
              )}
              {registeredCwd === (selectedCwdProp ?? selectedCwd) && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
                  {/* Active Book Selector Panel */}
                  <div style={{
                    margin: "8px 10px",
                    padding: "8px 10px",
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    fontFamily: "var(--font-serif)",
                    flexShrink: 0
                  }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>📖</span>
                    <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>当前书籍:</span>
                    <select
                      value={activeBookId || ""}
                      onChange={(e) => {
                        const newActive = e.target.value;
                        setActiveBookId(newActive);
                        const activeCwd = selectedCwdProp || selectedCwd;
                        if (activeCwd) {
                          checkWorkspaceStatus(activeCwd, newActive);
                        }
                      }}
                      style={{
                        flex: 1,
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: "5px",
                        padding: "3px 6px",
                        fontSize: "12px",
                        fontFamily: "var(--font-serif)",
                        color: "var(--text)",
                        outline: "none",
                        cursor: "pointer",
                        minWidth: 0,
                      }}
                    >
                      {availableBooks.map((book) => (
                        <option key={book} value={book}>
                          {book}
                        </option>
                      ))}

                    </select>
                    
                    <button
                      onClick={() => {
                        setDeleteBookError(null);
                        setIsDeleteBookModalOpen(true);
                      }}
                      title="删除当前书籍 (Delete Book)"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 24,
                        height: 24,
                        padding: 0,
                        background: "none",
                        border: "none",
                        color: "var(--text-dim)",
                        cursor: "pointer",
                        borderRadius: 4,
                        transition: "color 0.2s, background-color 0.2s"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#ef4444";
                        e.currentTarget.style.background = "rgba(239, 68, 68, 0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-dim)";
                        e.currentTarget.style.background = "none";
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                    </button>
                  </div>

                  {/* Consolidation Advisory Alert Card */}

                  {consolidationRecommend && (
                    <div style={{
                      margin: "8px 10px",
                      padding: "10px 12px",
                      background: "rgba(249, 115, 22, 0.04)",
                      border: "1px solid rgba(249, 115, 22, 0.25)",
                      borderRadius: "8px",
                      fontSize: "11px",
                      fontFamily: "var(--font-serif)",
                      boxShadow: "0 2px 8px rgba(249, 115, 22, 0.05)",
                      flexShrink: 0,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "#e07a34", marginBottom: 4 }}>
                        <span style={{ fontSize: 13 }}>🗜️</span>
                        <span>建议进行大纲摘要压缩</span>
                      </div>
                      <div style={{ color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 8 }}>
                        检测到完结卷 <strong>{recommendVolumeName}</strong>，建议运行压缩归档以优化大语言模型上下文，防止远期伏笔记忆衰退。
                      </div>
                      <button
                        onClick={handleRunConsolidate}
                        disabled={isConsolidating}
                        style={{
                          width: "100%",
                          padding: "5px 0",
                          background: "rgba(249, 115, 22, 0.08)",
                          border: "1px solid rgba(249, 115, 22, 0.35)",
                          borderRadius: "6px",
                          color: "#ff903f",
                          fontWeight: 600,
                          cursor: isConsolidating ? "not-allowed" : "pointer",
                          textAlign: "center",
                          fontSize: "11px",
                          transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) => {
                          if (!isConsolidating) {
                            e.currentTarget.style.background = "rgba(249, 115, 22, 0.16)";
                            e.currentTarget.style.borderColor = "#f97316";
                            e.currentTarget.style.color = "#ffaa64";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isConsolidating) {
                            e.currentTarget.style.background = "rgba(249, 115, 22, 0.08)";
                            e.currentTarget.style.borderColor = "rgba(249, 115, 22, 0.35)";
                            e.currentTarget.style.color = "#ff903f";
                          }
                        }}
                      >
                        {isConsolidating ? "正在压缩..." : "🗜️ 一键压缩归档"}
                      </button>
                    </div>
                  )}
                  {/* Fanfiction Mode Indicator Panel */}
                  {isFanfic && (
                    <div style={{
                      margin: "0 10px 8px 10px",
                      padding: "8px 12px",
                      background: "var(--bg-panel)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "11px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexShrink: 0,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)" }}>
                        <span style={{ fontSize: 13 }}>🎬</span>
                        <span>同人创作模式:</span>
                        <strong style={{ color: "var(--accent)", fontWeight: 600 }}>
                          {activeFanficMode === "canon" ? "正典延续" :
                           activeFanficMode === "au" ? "平行宇宙" :
                           activeFanficMode === "ooc" ? "角色偏离" :
                           activeFanficMode === "cp" ? "角色配对" : activeFanficMode || "未知"}
                        </strong>
                      </div>
                      <button
                        onClick={() => {
                          setIsFanficRefreshModalOpen(true);
                          setFanficRefreshSuccess(null);
                          setFanficRefreshError(null);
                          setFanficRefreshLogs([]);
                          setFanficRefreshSource("");
                        }}
                        style={{
                          padding: "2px 6px",
                          background: "var(--bg)",
                          color: "var(--text)",
                          border: "1px solid var(--border)",
                          borderRadius: "4px",
                          fontSize: "10px",
                          outline: "none",
                          cursor: "pointer",
                          fontWeight: 500,
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                      >
                        🔄 刷新设定
                      </button>
                    </div>
                  )}
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    <FileExplorer
                      cwd={selectedCwdProp ?? selectedCwd!}
                      onOpenFile={onOpenFile ?? (() => {})}
                      refreshKey={explorerKey}
                      onAtMention={onAtMention}
                      chapterStatusMap={chapterStatusMap}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Gem-xY custom agent panel (AI co-writers list, collapsible) */}
      {(selectedCwdProp || selectedCwd) && (
        <div style={{ flexShrink: 0, paddingBottom: 6 }}>
          <div
            onClick={() => setGemsExpanded(!gemsExpanded)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 10px 4px",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg
                width="9" height="9" viewBox="0 0 10 10" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: gemsExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}
              >
                <polyline points="3 2 7 5 3 8" />
              </svg>
              <span>AI 写作伴侣 (Co-writers)</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingGemId(null);
                setIsGemModalOpen(true);
              }}
              title="配置专属写作姬"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-dim)",
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 10,
                display: "flex",
                alignItems: "center",
                gap: 2,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
            >
              + Create
            </button>
          </div>

          {gemsExpanded && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "0 6px",
                maxHeight: 240,
                overflowY: "auto",
              }}
            >
              {gems.length === 0 ? (
                <div style={{ padding: "6px 10px", color: "var(--text-dim)", fontSize: 11, fontStyle: "italic" }}>
                  暂无写作姬，点击 Create 配置
                </div>
              ) : (
                gems.map((gem) => {
                  const isSelected = activeGemId === gem.id && !selectedSessionId;
                  const isDefaultGem = gem.id.startsWith("default-");
                  return (
                    <div
                      key={gem.id}
                      onClick={() => handleSelectGem(gem.id)}
                      title={gem.description || undefined}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 8px",
                        borderRadius: 6,
                        background: isSelected ? "var(--bg-selected)" : "transparent",
                        cursor: "pointer",
                        fontSize: 12,
                        transition: "all 0.12s",
                      }}
                      className="gem-sidebar-item"
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span style={{ fontSize: 14, flexShrink: 0 }}>{gem.avatar || "🔮"}</span>
                        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                          <span
                            style={{
                              color: isSelected ? "var(--accent)" : "var(--text)",
                              fontWeight: isSelected ? 600 : 500,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {gem.name}
                          </span>
                          {gem.description && (
                            <span
                              style={{
                                fontSize: 10,
                                color: "var(--text-dim)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {gem.description}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Actions */}
                      {!isDefaultGem && (
                        <div
                          className="gem-actions"
                          style={{
                            display: "flex",
                            gap: 4,
                            flexShrink: 0,
                            opacity: 0,
                            transition: "opacity 0.15s",
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingGemId(gem.id);
                              setIsGemModalOpen(true);
                            }}
                            title="编辑"
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--text-dim)",
                              cursor: "pointer",
                              padding: 2,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
                          >
                            ✎
                          </button>
                          <button
                            onClick={(e) => handleDeleteGem(e, gem.id)}
                            title="删除"
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--text-dim)",
                              cursor: "pointer",
                              padding: 2,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
                          >
                            🗑
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Session list section (AI chats / co-writing sessions, collapsible, default collapsed) */}
      {(selectedCwdProp || selectedCwd) && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          borderTop: "1px solid var(--border)",
          height: sessionsExpanded ? "auto" : "35px",
          boxSizing: "border-box",
          justifyContent: sessionsExpanded ? "flex-start" : "center",
        }}>
          <div
            onClick={() => setSessionsExpanded(!sessionsExpanded)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: sessionsExpanded ? "8px 10px 4px" : "0 10px",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg
                width="9" height="9" viewBox="0 0 10 10" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: sessionsExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}
              >
                <polyline points="3 2 7 5 3 8" />
              </svg>
              <span>AI 协同历史 (AI Chats)</span>
            </div>
          </div>

          {sessionsExpanded && (
            <div style={{ maxHeight: 160, overflowY: "auto", padding: "0" }}>
              {loading && (
                <div style={{ padding: "12px 14px", color: "var(--text-muted)", fontSize: 11 }}>
                  Loading...
                </div>
              )}
              {error && (
                <div style={{ padding: "12px 14px", color: "#f87171", fontSize: 11 }}>
                  {error}
                </div>
              )}
              {!loading && !error && filteredSessions.length === 0 && (
                <div style={{ padding: "12px 14px", color: "var(--text-muted)", fontSize: 11 }}>
                  无历史协同会话
                </div>
              )}
              {sessionTree.map((node) => (
                <SessionTreeItem
                  key={node.session.id}
                  node={node}
                  selectedSessionId={selectedSessionId}
                  onSelectSession={onSelectSession}
                  onRenamed={loadSessions}
                  onSessionDeleted={(id) => {
                    onSessionDeleted?.(id);
                    loadSessions();
                  }}
                  depth={0}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        .gem-sidebar-item:hover .gem-actions {
          opacity: 1 !important;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <GemEditorModal
        isOpen={isGemModalOpen}
        onClose={() => setIsGemModalOpen(false)}
        gemId={editingGemId}
        onSave={() => loadGems()}
        modelList={modelList}
        defaultModel={defaultModel}
      />
      
      {/* Delete Book Confirmation Modal */}
      {isDeleteBookModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            width: "min(420px, 90vw)",
            padding: "20px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            fontFamily: "var(--font-serif)",
          }}>
            <h3 style={{
              margin: "0 0 12px",
              fontSize: "15px",
              fontWeight: 600,
              color: "#ef4444",
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderBottom: "1px solid var(--border)",
              paddingBottom: "10px",
            }}>
              <span>⚠️</span>
              <span>删除书籍确认 (Delete Book)</span>
            </h3>

            {isDeletingBook ? (
              <div style={{ padding: "20px 10px", textAlign: "center" }}>
                <div style={{
                  width: "30px",
                  height: "30px",
                  border: "3px solid var(--border)",
                  borderTopColor: "#ef4444",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  margin: "0 auto 16px",
                }} />
                <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "12px" }}>
                  正在彻底删除书籍及相关数据...
                </div>
              </div>
            ) : (
              <div>
                {deleteBookError && (
                  <div style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: "6px",
                    padding: "10px",
                    color: "#ef4444",
                    fontSize: "11px",
                    marginBottom: "16px",
                    lineHeight: 1.5,
                  }}>
                    ⚠️ {deleteBookError}
                  </div>
                )}
                
                <p style={{ fontSize: "12px", color: "var(--text)", lineHeight: 1.6, margin: "0 0 16px" }}>
                  您确定要永久删除书籍 <strong style={{ color: "#ef4444" }}>{activeBookId}</strong> 吗？
                </p>

                
                <div style={{
                  background: "rgba(239, 68, 68, 0.04)",
                  border: "1px dashed rgba(239, 68, 68, 0.25)",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  lineHeight: 1.5,
                  marginBottom: "20px"
                }}>
                  <strong>此操作不可逆！</strong> 它将永久清除：
                  <ul style={{ margin: "4px 0 0", paddingLeft: "16px" }}>
                    <li>该书的所有章节草稿正文</li>
                    <li>人物卡片设定与世界观设定</li>
                    <li>所有的历史修订版本快照与大纲</li>
                  </ul>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setIsDeleteBookModalOpen(false)}
                    style={{
                      padding: "6px 14px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      background: "transparent",
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteBook}
                    style={{
                      padding: "6px 16px",
                      background: "#ef4444",
                      border: "none",
                      borderRadius: "6px",
                      color: "white",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    确认删除
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Book Modal */}
      {isBookModalOpen && (

        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            width: "min(480px, 90vw)",
            padding: "20px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            fontFamily: "var(--font-serif)",
          }}>
            <h3 style={{
              margin: "0 0 16px",
              fontSize: "15px",
              fontWeight: 600,
              color: "var(--text)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderBottom: "1px solid var(--border)",
              paddingBottom: "10px",
            }}>
              <span>📚</span>
              <span>创建新小说书籍 (Create Book)</span>
            </h3>
            
            {isCreatingBook ? (
              <div style={{ padding: "30px 10px", textAlign: "center" }}>
                <div style={{
                  width: "36px",
                  height: "36px",
                  border: "3px solid var(--border)",
                  borderTopColor: "var(--accent)",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  margin: "0 auto 16px",
                }} />
                <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 8, fontSize: "13px" }}>
                  正在生成创作宇宙基础设定...
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "11px", lineHeight: 1.6, maxWidth: "300px", margin: "0 auto" }}>
                  AI 架构师正在分析题材大纲，并自动构建卷大纲、角色设定卡片与世界观法则，请稍候约 30 秒。
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateBook}>
                {bookError && (
                  <div style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: "6px",
                    padding: "10px",
                    color: "#ef4444",
                    fontSize: "11px",
                    marginBottom: "16px",
                    lineHeight: 1.5,
                  }}>
                    ⚠️ {bookError}
                  </div>
                )}

                {(detectedFramework || detectedCharacter) ? (
                  <div style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "12px",
                    marginBottom: "16px",
                    fontSize: "12px",
                  }}>
                    <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: "8px", display: "flex", alignItems: "center", gap: 6 }}>
                      <span>🔍 检测到本地创作设定，请选择是否作为新书创建基础：</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {detectedFramework && (
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "var(--text)" }}>
                          <input
                            type="checkbox"
                            checked={useFramework}
                            onChange={(e) => setUseFramework(e.target.checked)}
                            style={{ cursor: "pointer" }}
                          />
                          <span>小说框架：<code style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--accent)" }}>{detectedFramework.name}</code></span>
                        </label>
                      )}
                      {detectedCharacter && (
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "var(--text)" }}>
                          <input
                            type="checkbox"
                            checked={useCharacter}
                            onChange={(e) => setUseCharacter(e.target.checked)}
                            style={{ cursor: "pointer" }}
                          />
                          <span>角色人设：<code style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--accent)" }}>{detectedCharacter.name}</code></span>
                        </label>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    background: "var(--bg-panel)",
                    border: "1px dashed var(--border)",
                    borderRadius: "8px",
                    padding: "12px",
                    marginBottom: "16px",
                    fontSize: "11px",
                    lineHeight: 1.6,
                    color: "var(--text-muted)",
                  }}>
                    <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: "6px", display: "flex", alignItems: "center", gap: 6 }}>
                      <span>💡 创作建议与提示</span>
                    </div>
                    当前未检测到本地的「小说框架」或「角色人设」设定文件。您可以：
                    <ul style={{ margin: "4px 0 0", paddingLeft: "16px", display: "flex", flexDirection: "column", gap: "2px" }}>
                      <li><strong>直接创建书卷</strong>：忽略此提示，系统将自动为您构思并生成初始的世界观与角色人设。</li>
                      <li><strong>AI 协同起草</strong>：先关闭此窗口，用左侧的<strong>「AI写作伴侣」</strong>来共同探讨并起草您的框架与人设设定，保存后再行创建。</li>
                    </ul>
                  </div>
                )}
                
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                    小说书名 (Title)
                  </label>
                  <input
                    type="text"
                    required
                    value={bookTitle}
                    onChange={(e) => setBookTitle(e.target.value)}
                    placeholder="例如：万古大帝"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontSize: "12px",
                      fontFamily: "var(--font-serif)",
                      outline: "none",
                    }}
                  />
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                      小说题材 (Genre)
                    </label>
                    <select
                      value={bookGenre}
                      onChange={(e) => setBookGenre(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        background: "var(--bg)",
                        color: "var(--text)",
                        fontSize: "12px",
                        outline: "none",
                      }}
                    >
                      <optgroup label="中文网文题材 (Chinese Genres)" style={{ background: "var(--bg-panel)", color: "var(--text)" }}>
                        <option value="xuanhuan">玄幻奇幻 (Xuanhuan)</option>
                        <option value="xianxia">仙侠修真 (Xianxia)</option>
                        <option value="urban">都市异能 (Urban)</option>
                        <option value="horror">悬疑恐怖 (Horror)</option>
                        <option value="other">其它通用 (Other)</option>
                      </optgroup>
                      <optgroup label="英文原生题材 (English Genres)" style={{ background: "var(--bg-panel)", color: "var(--text)" }}>
                        <option value="litrpg">数据无限流/系统流 (LitRPG)</option>
                        <option value="progression">升级流奇幻 (Progression Fantasy)</option>
                        <option value="cozy">温馨奇幻 (Cozy Fantasy)</option>
                        <option value="cultivation">英文修真 (English Cultivation)</option>
                        <option value="dungeon-core">地下城核心流 (Dungeon Core)</option>
                        <option value="isekai">异世界穿梭 (Isekai / Portal Fantasy)</option>
                        <option value="romantasy">浪漫奇幻 (Romantasy)</option>
                        <option value="sci-fi">科学幻想 (Science Fiction)</option>
                        <option value="system-apocalypse">系统废土流 (System Apocalypse)</option>
                        <option value="tower-climber">爬塔闯关流 (Tower Climbing)</option>
                      </optgroup>
                      <optgroup label="特殊创作模式 (Special Modes)" style={{ background: "var(--bg-panel)", color: "var(--text)" }}>
                        <option value="fanfic">同人创作 (Fanfic)</option>
                      </optgroup>
                    </select>
                  </div>
                  
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                      目标平台 (Platform)
                    </label>
                    <select
                      value={bookPlatform}
                      onChange={(e) => setBookPlatform(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        background: "var(--bg)",
                        color: "var(--text)",
                        fontSize: "12px",
                        outline: "none",
                      }}
                    >
                      <option value="tomato">番茄小说 (Tomato)</option>
                      <option value="qidian">起点中文 (Qidian)</option>
                      <option value="other">其他独立平台 (Other)</option>
                    </select>
                  </div>
                </div>
                
                {bookGenre === "fanfic" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                        同人创作模式 (Fanfic Mode)
                      </label>
                      <select
                        value={fanficMode}
                        onChange={(e) => setFanficMode(e.target.value as any)}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          background: "var(--bg)",
                          color: "var(--text)",
                          fontSize: "12px",
                          outline: "none",
                        }}
                      >
                        <option value="canon">正典延续 (Canon - 忠实原著剧情补完)</option>
                        <option value="au">平行宇宙 (AU - 相同设定不同时空/世界)</option>
                        <option value="ooc">角色偏离 (OOC - 性格反转与脑洞脑侧)</option>
                        <option value="cp">角色配对 (CP - 深入刻画人物关系与情感)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                        原作素材文件/目录绝对路径 (Source Path - 必填)
                      </label>
                      <input
                        type="text"
                        value={fanficSource}
                        onChange={(e) => setFanficSource(e.target.value)}
                        placeholder="请输入原作素材的绝对路径，例如: D:/novel/source.txt"
                        required
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          background: "var(--bg)",
                          color: "var(--text)",
                          fontSize: "12px",
                          fontFamily: "var(--font-serif)",
                          outline: "none",
                        }}
                      />
                      <div style={{ color: "var(--text-dim)", fontSize: "10px", marginTop: "4px", lineHeight: 1.4 }}>
                        支持指向一个 `.txt` / `.md` 文本文件，或包含若干原作设定/故事文本的文件夹绝对路径。AI 将会自动提取并解析作为同人设定依据。
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom: "20px" }}>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
                      大纲梗概/创意简报 (Brief - 可选)
                    </label>
                    <textarea
                      value={bookBrief}
                      onChange={(e) => setBookBrief(e.target.value)}
                      placeholder="在此输入您的创意构想（例如：主角是退役兵王、金手指是万界交易面板、核心冲突为世家倾轧）。AI 架构师将优先融合您的创意进行大纲设定设计。"
                      rows={4}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        background: "var(--bg)",
                        color: "var(--text)",
                        fontSize: "12px",
                        fontFamily: "var(--font-serif)",
                        lineHeight: "1.6",
                        outline: "none",
                        resize: "vertical",
                      }}
                    />
                  </div>
                )}
                
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                  <button
                    type="button"
                    onClick={() => setIsBookModalOpen(false)}
                    style={{
                      padding: "6px 14px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      background: "transparent",
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: "6px 16px",
                      background: "var(--accent)",
                      border: "none",
                      borderRadius: "6px",
                      color: "white",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    确认创建
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Chapter Write Progress Modal */}
      {isWriteLoading && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            width: "min(600px, 90vw)",
            padding: "24px 20px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            fontFamily: "var(--font-serif)",
            textAlign: "center",
          }}>
            {!writeError ? (
              <div style={{
                width: "36px",
                height: "36px",
                border: "3px solid var(--border)",
                borderTopColor: "var(--accent)",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 16px",
              }} />
            ) : (
              <div style={{ fontSize: "28px", margin: "0 auto 12px", color: "#ef4444" }}>
                ⚠️
              </div>
            )}
            <div style={{ fontWeight: 600, color: writeError ? "#ef4444" : "var(--text)", marginBottom: 8, fontSize: "14px" }}>
              {writeError ? "智能写作首章失败" : "正在进行智能首章写作..."}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "11px", lineHeight: 1.6 }}>
              {writeError ? `错误详情: ${writeError}` : writeProgressText}
            </div>

            {/* Terminal Live Output Console */}
            <div 
              ref={consoleRef}
              style={{
                background: "#121214",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "12px",
                height: "240px",
                overflowY: "auto",
                textAlign: "left",
                fontFamily: "var(--font-mono), monospace",
                fontSize: "11px",
                lineHeight: "1.5",
                color: "#e4e4e7",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                marginTop: "16px",
              }}
            >
              {logs.length === 0 ? (
                <span style={{ color: "var(--text-dim)" }}>正在启动写作引擎...</span>
              ) : (
                logs.map((log, index) => (
                  <div key={index} style={{ marginBottom: 2 }}>
                    {log}
                  </div>
                ))
              )}
            </div>

            {writeError && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
                <button
                  onClick={() => {
                    setIsWriteLoading(false);
                    setWriteError(null);
                  }}
                  style={{
                    padding: "6px 20px",
                    background: "var(--accent)",
                    border: "none",
                    borderRadius: "6px",
                    color: "white",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  关闭
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chapter Write Report Modal */}
      {isWriteReportOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            width: "min(500px, 90vw)",
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            fontFamily: "var(--font-serif)",
            overflow: "hidden",
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 18px",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-panel)",
              flexShrink: 0
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                {writeReportTitle}
              </span>
              <button
                onClick={() => setIsWriteReportOpen(false)}
                style={{
                  padding: "4px 12px",
                  fontSize: 11,
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                  background: "var(--bg-hover)",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                ✕ 关闭
              </button>
            </div>
            <div style={{
              flex: 1,
              padding: "18px",
              overflowY: "auto",
              lineHeight: "1.8",
              fontSize: "12px",
              color: "var(--text)",
            }} className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{writeReportContent}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
      {/* Book Export Modal */}
      {isExportModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            width: "480px",
            maxWidth: "90%",
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "var(--font-serif)",
          }}>
            {/* Modal Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", borderBottom: "1px solid var(--border)",
              background: "var(--bg)",
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                📤 导出小说书稿 ({activeBookId})
              </span>
              <button
                onClick={() => { if (!isExporting) setIsExportModalOpen(false); }}
                disabled={isExporting}
                style={{
                  background: "none", border: "none", color: "var(--text-dim)",
                  fontSize: 14, cursor: isExporting ? "not-allowed" : "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleExportBook} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Format selection */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>选择导出格式</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["epub", "txt", "md"] as const).map((fmt) => (
                    <label
                      key={fmt}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        height: 38,
                        background: exportFormat === fmt ? "var(--bg-selected)" : "var(--bg)",
                        border: exportFormat === fmt ? "1px solid var(--accent)" : "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        color: exportFormat === fmt ? "var(--accent)" : "var(--text-muted)",
                        cursor: isExporting ? "not-allowed" : "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <input
                        type="radio"
                        name="exportFormat"
                        value={fmt}
                        checked={exportFormat === fmt}
                        disabled={isExporting}
                        onChange={() => setExportFormat(fmt)}
                        style={{ display: "none" }}
                      />
                      <span>{fmt.toUpperCase()}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Toggle switch for approved-only */}
              <label style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 12, color: "var(--text)", cursor: isExporting ? "not-allowed" : "pointer",
                userSelect: "none"
              }}>
                <input
                  type="checkbox"
                  checked={exportApprovedOnly}
                  disabled={isExporting}
                  onChange={(e) => setExportApprovedOnly(e.target.checked)}
                  style={{
                    width: 14, height: 14, accentColor: "var(--accent)", cursor: "pointer"
                  }}
                />
                <span>仅导出已过审章节 (Approved Only)</span>
              </label>

              {/* Progress logs & Result alerts */}
              {(isExporting || exportLogs.length > 0 || exportError || exportSuccessText) && (
                <div style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "12px",
                  fontSize: 11,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}>
                  {exportError && (
                    <div style={{ color: "#ef4444", fontWeight: 600 }}>
                      ⚠️ 导出失败: {exportError}
                    </div>
                  )}
                  {exportSuccessText && (
                    <div style={{ color: "#10b981", fontWeight: 600 }}>
                      {exportSuccessText}
                    </div>
                  )}
                  {isExporting && (
                    <div style={{ color: "var(--accent)", display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin" style={{ animation: "spin 1s linear infinite" }}>
                        <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                      </svg>
                      <span>正在整理并排版书稿中，请稍候...</span>
                    </div>
                  )}
                  {exportLogs.length > 0 && (
                    <div style={{
                      maxHeight: "80px", overflowY: "auto",
                      fontFamily: "var(--font-mono)", fontSize: 10,
                      color: "var(--text-dim)", background: "rgba(0,0,0,0.15)",
                      padding: "6px", borderRadius: 4, whiteSpace: "pre-wrap"
                    }}>
                      {exportLogs.join("")}
                    </div>
                  )}
                </div>
              )}

              {/* Form Actions */}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="submit"
                  disabled={isExporting}
                  style={{
                    flex: 1, height: 38,
                    background: "var(--accent)",
                    border: "none", borderRadius: 8,
                    color: "white", fontSize: 12, fontWeight: 600,
                    cursor: isExporting ? "not-allowed" : "pointer",
                    opacity: isExporting ? 0.7 : 1,
                  }}
                >
                  {isExporting ? "正在导出..." : "确认开始导出"}
                </button>
                {!isExporting && (
                  <button
                    type="button"
                    onClick={() => setIsExportModalOpen(false)}
                    style={{
                      padding: "0 16px", height: 38,
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border)", borderRadius: 8,
                      color: "var(--text-muted)", fontSize: 12, fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    取消
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Novel Import Wizard Modal */}
      {isImportModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            width: "500px",
            maxWidth: "95%",
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "var(--font-serif)",
          }}>
            {/* Modal Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", borderBottom: "1px solid var(--border)",
              background: "var(--bg)",
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                📥 InkOS 导入向导 ({activeBookId})
              </span>
              <button
                onClick={() => { if (!isImporting) setIsImportModalOpen(false); }}
                disabled={isImporting}
                style={{
                  background: "none", border: "none", color: "var(--text-dim)",
                  fontSize: 14, cursor: isImporting ? "not-allowed" : "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* Tabs Header */}
            <div style={{
              display: "flex",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-panel)",
            }}>
              <button
                type="button"
                onClick={() => { if (!isImporting) setActiveImportTab("chapters"); }}
                disabled={isImporting}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  fontSize: 12,
                  fontWeight: 600,
                  border: "none",
                  background: activeImportTab === "chapters" ? "var(--bg)" : "transparent",
                  color: activeImportTab === "chapters" ? "var(--accent)" : "var(--text-muted)",
                  borderBottom: activeImportTab === "chapters" ? "2px solid var(--accent)" : "none",
                  cursor: isImporting ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                📥 导入旧章原稿
              </button>
              <button
                type="button"
                onClick={() => { if (!isImporting) setActiveImportTab("canon"); }}
                disabled={isImporting}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  fontSize: 12,
                  fontWeight: 600,
                  border: "none",
                  background: activeImportTab === "canon" ? "var(--bg)" : "transparent",
                  color: activeImportTab === "canon" ? "var(--accent)" : "var(--text-muted)",
                  borderBottom: activeImportTab === "canon" ? "2px solid var(--accent)" : "none",
                  cursor: isImporting ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                📖 导入前作设定 (Canon)
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleImport} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
              {activeImportTab === "chapters" ? (
                <>
                  {/* Book selection / creation option */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                      选择导入的目标书籍*
                    </label>
                    {availableBooks.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", gap: 10 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text)", cursor: "pointer" }}>
                            <input
                              type="radio"
                              name="importBookSelect"
                              checked={importBookSelection === "active"}
                              onChange={() => setImportBookSelection("active")}
                              disabled={isImporting}
                              style={{ accentColor: "var(--accent)" }}
                            />
                            <span>当前书籍 ({activeBookId})</span>
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text)", cursor: "pointer" }}>
                            <input
                              type="radio"
                              name="importBookSelect"
                              checked={importBookSelection === "new"}
                              onChange={() => setImportBookSelection("new")}
                              disabled={isImporting}
                              style={{ accentColor: "var(--accent)" }}
                            />
                            <span>➕ 导入并创建新书籍</span>
                          </label>
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
                        ⚠️ 当前小说宇宙内尚无书籍，将自动创建新书籍进行导入。
                      </span>
                    )}
                  </div>

                  {(importBookSelection === "new" || availableBooks.length === 0) && (
                    <div style={{
                      background: "rgba(var(--accent-rgb), 0.03)",
                      border: "1px dashed var(--border)",
                      borderRadius: 8,
                      padding: "10px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8
                    }}>
                      <div style={{ display: "flex", gap: 10 }}>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>新书籍 ID (拼音/英文)*</label>
                          <input
                            type="text"
                            value={newBookId}
                            onChange={(e) => setNewBookId(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, ""))}
                            placeholder="如: my_new_novel"
                            disabled={isImporting}
                            style={{
                              width: "100%", padding: "6px 8px", borderRadius: 4,
                              background: "var(--bg)", border: "1px solid var(--border)",
                              color: "var(--text)", fontSize: 11, fontFamily: "var(--font-mono)",
                              outline: "none"
                            }}
                            required
                          />
                        </div>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>新书籍名称*</label>
                          <input
                            type="text"
                            value={newBookTitle}
                            onChange={(e) => setNewBookTitle(e.target.value)}
                            placeholder="如: 我的新科幻小说"
                            disabled={isImporting}
                            style={{
                              width: "100%", padding: "6px 8px", borderRadius: 4,
                              background: "var(--bg)", border: "1px solid var(--border)",
                              color: "var(--text)", fontSize: 11, fontFamily: "var(--font-serif)",
                              outline: "none"
                            }}
                            required
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                      输入源文件或文件夹路径 (from)*
                    </label>
                    <input
                      type="text"
                      value={importFromPath}
                      onChange={(e) => setImportFromPath(e.target.value)}
                      placeholder="如: D:/novel/drafts (目录) 或 D:/draft.txt (单文件)"
                      disabled={isImporting}
                      style={{
                        width: "100%", padding: "8px 10px", borderRadius: 6,
                        background: "var(--bg)", border: "1px solid var(--border)",
                        color: "var(--text)", fontSize: 12, fontFamily: "var(--font-mono)",
                        outline: "none"
                      }}
                      required
                    />
                    <span style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.4 }}>
                      提示：系统会扫描目录下的所有 .md/.txt 并按文件名排序，或读取大文件进行自动分章，同时**提取人设与设定数据库**以备续写。
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                        分章正则式 (可选)
                      </label>
                      <input
                        type="text"
                        value={importSplitRegex}
                        onChange={(e) => setImportSplitRegex(e.target.value)}
                        placeholder="如: ^第[一二三四五]章"
                        disabled={isImporting}
                        style={{
                          width: "100%", padding: "8px 10px", borderRadius: 6,
                          background: "var(--bg)", border: "1px solid var(--border)",
                          color: "var(--text)", fontSize: 12, fontFamily: "var(--font-mono)",
                          outline: "none"
                        }}
                      />
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                        续传章节号 (可选)
                      </label>
                      <input
                        type="number"
                        value={importResumeFrom}
                        onChange={(e) => setImportResumeFrom(e.target.value)}
                        placeholder="如: 12"
                        disabled={isImporting}
                        style={{
                          width: "100%", padding: "8px 10px", borderRadius: 6,
                          background: "var(--bg)", border: "1px solid var(--border)",
                          color: "var(--text)", fontSize: 12, fontFamily: "var(--font-mono)",
                          outline: "none"
                        }}
                      />
                    </div>
                  </div>

                  <label style={{
                    display: "flex", alignItems: "center", gap: 8,
                    fontSize: 11, color: "var(--text)", cursor: isImporting ? "not-allowed" : "pointer",
                    userSelect: "none", marginTop: 4
                  }}>
                    <input
                      type="checkbox"
                      checked={importIsSeries}
                      disabled={isImporting}
                      onChange={(e) => setImportIsSeries(e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: "var(--accent)", cursor: "pointer" }}
                    />
                    <span>作为独立同宇宙系列作品导入 (shared universe spinoff)</span>
                  </label>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                    选择或输入前作书籍 ID (parentBookId)*
                  </label>
                  {availableBooks.filter(b => b !== activeBookId).length > 0 ? (
                    <select
                      value={importCanonFromBookId}
                      onChange={(e) => setImportCanonFromBookId(e.target.value)}
                      disabled={isImporting}
                      style={{
                        width: "100%", padding: "8px 10px", borderRadius: 6,
                        background: "var(--bg)", border: "1px solid var(--border)",
                        color: "var(--text)", fontSize: 12, fontFamily: "var(--font-serif)",
                        outline: "none", cursor: "pointer"
                      }}
                      required
                    >
                      <option value="">-- 请选择书籍 --</option>
                      {availableBooks.filter(b => b !== activeBookId).map((book) => (
                        <option key={book} value={book}>{book}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={importCanonFromBookId}
                      onChange={(e) => setImportCanonFromBookId(e.target.value)}
                      placeholder="请输入前作 Book ID (例如: my_first_novel)"
                      disabled={isImporting}
                      style={{
                        width: "100%", padding: "8px 10px", borderRadius: 6,
                        background: "var(--bg)", border: "1px solid var(--border)",
                        color: "var(--text)", fontSize: 12, fontFamily: "var(--font-mono)",
                        outline: "none"
                      }}
                      required
                    />
                  )}
                  <span style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.4 }}>
                    提示：将从所选的书籍目录中复制并合并人物卡片、纪元史和设定，帮助在全新书籍中开展同宇宙故事线（Spinoff）的创作。
                  </span>
                </div>
              )}

              {/* Console Log Console */}
              {(isImporting || importLogs.length > 0 || importError || importSuccessText) && (
                <div style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "12px",
                  fontSize: 11,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}>
                  {importError && (
                    <div style={{ color: "#ef4444", fontWeight: 600 }}>
                      ⚠️ 导入失败: {importError}
                    </div>
                  )}
                  {importSuccessText && (
                    <div style={{ color: "#10b981", fontWeight: 600 }}>
                      {importSuccessText}
                    </div>
                  )}
                  {isImporting && (
                    <div style={{ color: "var(--accent)", display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin" style={{ animation: "spin 1s linear infinite" }}>
                        <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                      </svg>
                      <span>正在运行 InkOS 智能导入引擎，请稍候...</span>
                    </div>
                  )}
                  {importLogs.length > 0 && (
                    <div
                      ref={importConsoleRef}
                      style={{
                        maxHeight: "80px", overflowY: "auto",
                        fontFamily: "var(--font-mono)", fontSize: 10,
                        color: "var(--text-dim)", background: "#121214",
                        padding: "6px", borderRadius: 4, whiteSpace: "pre-wrap",
                        textAlign: "left",
                      }}
                    >
                      {importLogs.map((log, index) => (
                        <div key={index} style={{ marginBottom: 2 }}>{log}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Form Actions */}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="submit"
                  disabled={isImporting}
                  style={{
                    flex: 1, height: 38,
                    background: "var(--accent)",
                    border: "none", borderRadius: 8,
                    color: "white", fontSize: 12, fontWeight: 600,
                    cursor: isImporting ? "not-allowed" : "pointer",
                    opacity: isImporting ? 0.7 : 1,
                  }}
                >
                  {isImporting ? "正在导入..." : "确认开始导入"}
                </button>
                {!isImporting && (
                  <button
                    type="button"
                    onClick={() => setIsImportModalOpen(false)}
                    style={{
                      padding: "0 16px", height: 38,
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border)", borderRadius: 8,
                      color: "var(--text-muted)", fontSize: 12, fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    取消
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Novel Style Clone Modal */}
      {isStyleModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            width: "500px",
            maxWidth: "95%",
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "var(--font-serif)",
          }}>
            {/* Modal Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", borderBottom: "1px solid var(--border)",
              background: "var(--bg)",
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                🎭 ink-xY 文风克隆工坊 ({activeBookId})
              </span>
              <button
                onClick={() => { if (!isCloning) setIsStyleModalOpen(false); }}
                disabled={isCloning}
                style={{
                  background: "none", border: "none", color: "var(--text-dim)",
                  fontSize: 14, cursor: isCloning ? "not-allowed" : "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* Tab Headers */}
            <div style={{
              display: "flex",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-panel)",
            }}>
              <button
                type="button"
                onClick={() => { if (!isCloning) setStyleMode("paste"); }}
                disabled={isCloning}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  fontSize: 12,
                  fontWeight: 600,
                  border: "none",
                  background: styleMode === "paste" ? "var(--bg)" : "transparent",
                  color: styleMode === "paste" ? "var(--accent)" : "var(--text-muted)",
                  borderBottom: styleMode === "paste" ? "2px solid var(--accent)" : "none",
                  cursor: isCloning ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                📝 直接粘贴样文
              </button>
              <button
                type="button"
                onClick={() => { if (!isCloning) setStyleMode("path"); }}
                disabled={isCloning}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  fontSize: 12,
                  fontWeight: 600,
                  border: "none",
                  background: styleMode === "path" ? "var(--bg)" : "transparent",
                  color: styleMode === "path" ? "var(--accent)" : "var(--text-muted)",
                  borderBottom: styleMode === "path" ? "2px solid var(--accent)" : "none",
                  cursor: isCloning ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                📂 指定本地文件
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleStyleImport} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Style Name Input */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                  文风名称 (如：金庸、江南、科幻冷峻、言情华丽)*
                </label>
                <input
                  type="text"
                  value={styleName}
                  onChange={(e) => setStyleName(e.target.value)}
                  placeholder="如: 金庸"
                  disabled={isCloning}
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 6,
                    background: "var(--bg)", border: "1px solid var(--border)",
                    color: "var(--text)", fontSize: 12, fontFamily: "var(--font-serif)",
                    outline: "none"
                  }}
                  required
                />
              </div>

              {styleMode === "paste" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                    粘贴样文本内容 (建议 1000 - 5000 字)*
                  </label>
                  <textarea
                    value={styleText}
                    onChange={(e) => setStyleText(e.target.value)}
                    placeholder="在此处粘贴您想让 AI 模仿写作的样文本内容（例如从金庸、江南等作家的作品中复制一两页经典段落）..."
                    disabled={isCloning}
                    style={{
                      width: "100%", height: "120px", padding: "8px 10px", borderRadius: 6,
                      background: "var(--bg)", border: "1px solid var(--border)",
                      color: "var(--text)", fontSize: 11, fontFamily: "var(--font-serif)",
                      outline: "none", resize: "none", lineHeight: 1.5,
                    }}
                    required
                  />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                    输入源文本文件绝对路径 (from)*
                  </label>
                  <input
                    type="text"
                    value={stylePath}
                    onChange={(e) => setStylePath(e.target.value)}
                    placeholder="如: D:/novel/samples/jinyong_sample.txt"
                    disabled={isCloning}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: 6,
                      background: "var(--bg)", border: "1px solid var(--border)",
                      color: "var(--text)", fontSize: 12, fontFamily: "var(--font-mono)",
                      outline: "none"
                    }}
                    required
                  />
                </div>
              )}

              {/* Targets select */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                  应用的目标书籍 (克隆成果将写入该书)*
                </label>
                <select
                  value={activeBookId || ""}
                  onChange={(e) => setActiveBookId(e.target.value)}
                  disabled={isCloning}
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 6,
                    background: "var(--bg)", border: "1px solid var(--border)",
                    color: "var(--text)", fontSize: 12, fontFamily: "var(--font-serif)",
                    outline: "none", cursor: "pointer"
                  }}
                  required
                >
                  {availableBooks.map((book) => (
                    <option key={book} value={book}>{book}</option>
                  ))}
                </select>
              </div>

              {/* Console log / feedback */}
              {(isCloning || styleLogs.length > 0 || styleError || styleSuccessText) && (
                <div style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "12px",
                  fontSize: 11,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}>
                  {styleError && (
                    <div style={{ color: "#ef4444", fontWeight: 600 }}>
                      ⚠️ 克隆失败: {styleError}
                    </div>
                  )}
                  {styleSuccessText && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ color: "#10b981", fontWeight: 600 }}>
                        {styleSuccessText}
                      </div>
                      {styleGuidePath && onOpenFile && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenFile(styleGuidePath, "style_guide.md");
                            setIsStyleModalOpen(false);
                          }}
                          style={{
                            alignSelf: "flex-start",
                            padding: "4px 10px",
                            background: "rgba(16,185,129,0.08)",
                            border: "1px solid #10b981",
                            borderRadius: 4,
                            color: "#10b981",
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                        >
                          📖 查看生成的文风指南 (style_guide.md)
                        </button>
                      )}
                    </div>
                  )}
                  {isCloning && (
                    <div style={{ color: "var(--accent)", display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin" style={{ animation: "spin 1s linear infinite" }}>
                        <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                      </svg>
                      <span>正在提取分析统计特征并由 LLM 克隆生成文风指南，请稍候...</span>
                    </div>
                  )}
                  {styleLogs.length > 0 && (
                    <div
                      ref={styleConsoleRef}
                      style={{
                        maxHeight: "80px", overflowY: "auto",
                        fontFamily: "var(--font-mono)", fontSize: 10,
                        color: "var(--text-dim)", background: "#121214",
                        padding: "6px", borderRadius: 4, whiteSpace: "pre-wrap",
                        textAlign: "left",
                      }}
                    >
                      {styleLogs.map((log, index) => (
                        <div key={index} style={{ marginBottom: 2 }}>{log}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Form Actions */}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="submit"
                  disabled={isCloning}
                  style={{
                    flex: 1, height: 38,
                    background: "var(--accent)",
                    border: "none", borderRadius: 8,
                    color: "white", fontSize: 12, fontWeight: 600,
                    cursor: isCloning ? "not-allowed" : "pointer",
                    opacity: isCloning ? 0.7 : 1,
                  }}
                >
                  {isCloning ? "正在克隆分析..." : "确认克隆文风"}
                </button>
                {!isCloning && (
                  <button
                    type="button"
                    onClick={() => setIsStyleModalOpen(false)}
                    style={{
                      padding: "0 16px", height: 38,
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border)", borderRadius: 8,
                      color: "var(--text-muted)", fontSize: 12, fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    取消
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Novel Fanfic Refresh Modal */}
      {isFanficRefreshModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            width: "500px",
            maxWidth: "95%",
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "var(--font-serif)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", borderBottom: "1px solid var(--border)",
              background: "rgba(139, 92, 246, 0.08)",
              color: "#a78bfa",
            }}>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <span>🔄</span>
                <span>刷新同人原作设定 ({activeBookId})</span>
              </h3>
              {!isRefreshingCanon && (
                <button
                  onClick={() => setIsFanficRefreshModalOpen(false)}
                  style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 16 }}
                >
                  ✕
                </button>
              )}
            </div>

            <form onSubmit={handleFanficRefresh} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
              {fanficRefreshError && (
                <div style={{ padding: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#ef4444", fontSize: 11 }}>
                  ⚠️ {fanficRefreshError}
                </div>
              )}
              {fanficRefreshSuccess && (
                <div style={{ padding: 10, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, color: "#10b981", fontSize: 11 }}>
                  ✨ {fanficRefreshSuccess}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                  同人原作素材绝对路径 (Source Path - 必填)
                </label>
                <input
                  type="text"
                  value={fanficRefreshSource}
                  onChange={(e) => setFanficRefreshSource(e.target.value)}
                  placeholder="请输入最新的原著素材路径，例如: D:/novel/source_v2.txt"
                  required
                  disabled={isRefreshingCanon}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: "12px",
                    fontFamily: "var(--font-serif)",
                    outline: "none",
                  }}
                />
              </div>

              {fanficRefreshLogs.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                    刷新运行日志
                  </label>
                  <div
                    ref={fanficRefreshConsoleRef}
                    style={{
                      height: "150px",
                      background: "#1e1e1e",
                      color: "#d4d4d4",
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                      lineHeight: "1.5",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {fanficRefreshLogs.map((log, i) => (
                      <div key={i}>{log}</div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, borderTop: "1px solid var(--border)", paddingTop: "14px", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  disabled={isRefreshingCanon}
                  style={{
                    padding: "0 16px", height: 38,
                    background: "#a78bfa",
                    border: "none", borderRadius: 8,
                    color: "white", fontSize: 12, fontWeight: 600,
                    cursor: isRefreshingCanon ? "not-allowed" : "pointer",
                    opacity: isRefreshingCanon ? 0.7 : 1,
                  }}
                >
                  {isRefreshingCanon ? "正在分析刷新..." : "开始刷新"}
                </button>
                {!isRefreshingCanon && (
                  <button
                    type="button"
                    onClick={() => setIsFanficRefreshModalOpen(false)}
                    style={{
                      padding: "0 16px", height: 38,
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border)", borderRadius: 8,
                      color: "var(--text-muted)", fontSize: 12, fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    取消
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Novel Consolidation Modal */}
      {isConsolidationModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            width: "500px",
            maxWidth: "90%",
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "var(--font-serif)",
          }}>
            {/* Modal Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", borderBottom: "1px solid var(--border)",
              background: "var(--bg)",
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                <span>🗜️</span> 大纲摘要压缩归档
              </span>
              <button
                onClick={() => { if (!isConsolidating) setIsConsolidationModalOpen(false); }}
                disabled={isConsolidating}
                style={{
                  background: "none", border: "none", color: "var(--text-dim)",
                  fontSize: 14, cursor: isConsolidating ? "not-allowed" : "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                运行大纲摘要压缩会将已完结分卷的逐章梗概合并提炼，输出到分卷摘要中，并对已完结章节的明细梗概进行历史归档，以大幅缩减大语言模型上下文 Token 占用，提升续写连贯性，防止远期情节记忆退化。
              </div>

              {/* Console Logs */}
              {(isConsolidating || consolidationLogs.length > 0) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                    {isConsolidating && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin" style={{ animation: "spin 1s linear infinite" }}>
                        <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                      </svg>
                    )}
                    <span>执行控制台日志：</span>
                  </div>
                  <div
                    ref={consolidateConsoleRef}
                    style={{
                      height: "150px", overflowY: "auto",
                      fontFamily: "var(--font-mono)", fontSize: 10,
                      color: "var(--text-dim)", background: "#121214",
                      padding: "8px 12px", borderRadius: 6, whiteSpace: "pre-wrap",
                      textAlign: "left", border: "1px solid var(--border)",
                      lineHeight: 1.4
                    }}
                  >
                    {consolidationLogs.length === 0 ? (
                      <div style={{ color: "#6b7280" }}>正在初始化并启动命令行脚本...</div>
                    ) : (
                      consolidationLogs.map((log, index) => (
                        <div key={index} style={{ marginBottom: 2 }}>{log}</div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Success Result Info */}
              {consolidationResult && (
                <div style={{
                  background: "rgba(16, 185, 129, 0.04)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: 8,
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "#10b981", fontSize: "12px" }}>
                    <span>✨</span> 压缩归档完成
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                    <div style={{ marginBottom: 4 }}>
                      • 成功压缩归档卷数：<strong>{consolidationResult.archivedVolumes} 卷</strong>
                    </div>
                    <div>
                      • 当前内存保留近期章节：<strong>{consolidationResult.retainedChapters} 章</strong>
                    </div>
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: 4, borderTop: "1px dashed rgba(16, 185, 129, 0.15)", paddingTop: 4 }}>
                    已将对应卷的章节梗概安全移动至归档目录，活动大纲摘要已刷新。
                  </div>
                </div>
              )}

              {/* Error Message */}
              {consolidationError && (
                <div style={{
                  background: "rgba(239, 68, 68, 0.04)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  borderRadius: 8,
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "#ef4444", fontSize: "12px" }}>
                    <span>⚠️</span> 执行出错
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
                    {consolidationError}
                  </div>
                </div>
              )}

              {/* Footer Actions */}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {isConsolidating ? (
                  <button
                    disabled
                    style={{
                      flex: 1, height: 38,
                      background: "var(--accent)", opacity: 0.7,
                      border: "none", borderRadius: 8,
                      color: "white", fontSize: 12, fontWeight: 600,
                      cursor: "not-allowed"
                    }}
                  >
                    正在压缩...
                  </button>
                ) : (
                  <button
                    onClick={() => setIsConsolidationModalOpen(false)}
                    style={{
                      flex: 1, height: 38,
                      background: "var(--accent)",
                      border: "none", borderRadius: 8,
                      color: "white", fontSize: 12, fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    {consolidationError ? "关闭" : "确认并关闭"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Market Radar Scan Modal */}
      {isRadarModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            width: "650px",
            maxWidth: "95%",
            maxHeight: "85vh",
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "var(--font-serif)",
          }}>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center",
              padding: "16px 20px", borderBottom: "1px solid var(--border)",
              background: "rgba(16, 185, 129, 0.08)",
              color: "#10b981",
              justifyContent: "space-between"
            }}>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <span>📡</span>
                <span>智能市场分析雷达 (Radar Market Scanner)</span>
              </h3>
              {!isScanningRadar && (
                <button
                  onClick={() => setIsRadarModalOpen(false)}
                  style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 16 }}
                >
                  ✕
                </button>
              )}
            </div>

            <div style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
              {radarError && (
                <div style={{ padding: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#ef4444", fontSize: 11 }}>
                  ⚠️ 扫描失败: {radarError}
                </div>
              )}

              {/* Progress Console */}
              {isScanningRadar && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                    <div style={{
                      width: "12px", height: "12px",
                      border: "2px solid var(--border)", borderTopColor: "#10b981",
                      borderRadius: "50%", animation: "spin 1s linear infinite"
                    }} />
                    <span>雷达天线展开，正在扫描各大网文平台潜力题材与受众风向...</span>
                  </div>
                  <div
                    ref={radarConsoleRef}
                    style={{
                      height: "220px",
                      background: "#121214",
                      color: "#d4d4d4",
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      padding: "10px 12px",
                      borderRadius: "6px",
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                      lineHeight: "1.5",
                      border: "1px solid var(--border)",
                      textAlign: "left"
                    }}
                  >
                    {radarLogs.map((log, i) => (
                      <div key={i}>{log}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Scan Results Display */}
              {!isScanningRadar && radarResult && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Summary Card */}
                  <div style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "14px 16px",
                    fontSize: "12px",
                    lineHeight: "1.6"
                  }}>
                    <div style={{ fontWeight: 600, color: "#10b981", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>📊</span> 市场概况总结 (Global Trend Summary)
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{radarResult.marketSummary}</ReactMarkdown>
                    </div>
                  </div>

                  {/* Recommendations Cards */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: "12px", color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                      <span>🎯</span> AI 潜力选题方向推荐 (AIGC Concept Prompts)
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {radarResult.recommendations?.map((rec: any, idx: number) => {
                        const confidencePercent = Math.round(rec.confidence * 100);
                        const isHigh = confidencePercent >= 75;
                        const badgeColor = isHigh ? "#10b981" : "#f59e0b";
                        const badgeBg = isHigh ? "rgba(16, 185, 129, 0.08)" : "rgba(245, 158, 11, 0.08)";

                        return (
                          <div
                            key={idx}
                            style={{
                              background: "var(--bg)",
                              border: "1px solid var(--border)",
                              borderRadius: "8px",
                              padding: "14px",
                              transition: "all 0.2s",
                              display: "flex",
                              flexDirection: "column",
                              gap: 8
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#10b981"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(16, 185, 129, 0.05)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)" }}>
                                {rec.platform} / {rec.genre}
                              </span>
                              <span style={{
                                fontSize: "10px", fontWeight: 600, padding: "2px 8px",
                                borderRadius: "10px", color: badgeColor, background: badgeBg,
                                border: `1px solid ${badgeColor}33`
                              }}>
                                潜力指数: {confidencePercent}%
                              </span>
                            </div>

                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                              <strong style={{ color: "var(--text)" }}>核心概念:</strong> {rec.concept}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                              <strong style={{ color: "var(--text)" }}>推荐逻辑:</strong> {rec.reasoning}
                            </div>
                            {rec.benchmarkTitles?.length > 0 && (
                              <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                                <span>🏷️ 对标书目:</span>
                                {rec.benchmarkTitles.map((b: string, i: number) => (
                                  <span key={i} style={{ background: "var(--bg-hover)", padding: "1px 6px", borderRadius: 4 }}>《{b}》</span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Start Scan view */}
              {!isScanningRadar && !radarResult && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "30px 10px", gap: 14, textAlign: "center" }}>
                  <span style={{ fontSize: "40px" }}>📡</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>扫描当前网文市场热点</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", maxWidth: 360, lineHeight: 1.6 }}>
                      AI 市场雷达将深度挖掘当前各大发布平台的热门标签、高互动率流派以及对标爆款，为您提供高置信度的写作题材概念指南。
                    </div>
                  </div>
                  <button
                    onClick={handleRadarScan}
                    style={{
                      padding: "8px 24px",
                      background: "#10b981", border: "none", borderRadius: "8px",
                      color: "white", fontSize: 12, fontWeight: 600,
                      cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                      transition: "opacity 0.15s"
                    }}
                  >
                    <span>📡</span> 启动雷达行情扫描
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              display: "flex", gap: 8, padding: "12px 20px",
              background: "var(--bg-panel)", borderTop: "1px solid var(--border)",
              justifyContent: "flex-end"
            }}>
              {!isScanningRadar && (
                <button
                  onClick={() => setIsRadarModalOpen(false)}
                  style={{
                    padding: "6px 16px",
                    background: "var(--bg-hover)", border: "1px solid var(--border)",
                    borderRadius: 8, color: "var(--text-muted)",
                    fontSize: 12, fontWeight: 500, cursor: "pointer"
                  }}
                >
                  关闭
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Short Fiction production Modal */}
      {isShortRunModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            width: "520px",
            maxWidth: "95%",
            maxHeight: "85vh",
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "var(--font-serif)",
          }}>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", borderBottom: "1px solid var(--border)",
              background: "rgba(139, 92, 246, 0.08)",
              color: "#a78bfa",
            }}>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <span>🚀</span>
                <span>全自动短篇小说工坊 (Auto Short Fiction Pipeline)</span>
              </h3>
              {!isRunningShort && (
                <button
                  onClick={() => setIsShortRunModalOpen(false)}
                  style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 16 }}
                >
                  ✕
                </button>
              )}
            </div>

             <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>
              {shortError && (
                <div style={{ padding: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#ef4444", fontSize: 11 }}>
                  ⚠️ 运行错误: {shortError}
                </div>
              )}
              {shortSuccess && (
                <div style={{
                  background: "rgba(16, 185, 129, 0.04)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: 8,
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "#10b981", fontSize: "13px" }}>
                    <span>✨</span> 阶段任务完成！
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {shortSuccess}
                  </div>
                </div>
              )}

              {/* Stepper Wizard Progress */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)", marginBottom: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: shortStoryId ? "#10b981" : (isRunningShort && shortFictionStage === "idle" ? "var(--accent)" : "var(--bg-hover)"),
                    color: shortStoryId ? "white" : "var(--text-muted)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: "bold"
                  }}>
                    {shortStoryId ? "✓" : "1"}
                  </div>
                  <span style={{ fontSize: 10, marginTop: 4, color: isRunningShort && shortFictionStage === "idle" ? "var(--accent)" : "var(--text-muted)" }}>大纲规划</span>
                </div>
                <div style={{ flex: 1, height: 2, background: shortStoryId ? "#10b981" : "var(--border)", margin: "0 -10px" }} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: shortFictionStage === "package" || shortFictionStage === "completed" ? "#10b981" : (isRunningShort && shortFictionStage === "draft" ? "var(--accent)" : "var(--bg-hover)"),
                    color: shortFictionStage === "package" || shortFictionStage === "completed" ? "white" : "var(--text-muted)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: "bold"
                  }}>
                    {shortFictionStage === "package" || shortFictionStage === "completed" ? "✓" : "2"}
                  </div>
                  <span style={{ fontSize: 10, marginTop: 4, color: isRunningShort && shortFictionStage === "draft" ? "var(--accent)" : "var(--text-muted)" }}>正文写作</span>
                </div>
                <div style={{ flex: 1, height: 2, background: shortFictionStage === "package" || shortFictionStage === "completed" ? "#10b981" : "var(--border)", margin: "0 -10px" }} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: shortFictionStage === "completed" ? "#10b981" : (isRunningShort && shortFictionStage === "package" ? "var(--accent)" : "var(--bg-hover)"),
                    color: shortFictionStage === "completed" ? "white" : "var(--text-muted)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: "bold"
                  }}>
                    {shortFictionStage === "completed" ? "✓" : "3"}
                  </div>
                  <span style={{ fontSize: 10, marginTop: 4, color: isRunningShort && shortFictionStage === "package" ? "var(--accent)" : "var(--text-muted)" }}>书封包装</span>
                </div>
              </div>

              {!isRunningShort && (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                      故事创意与走向方向 (Story Direction - 必填)*
                    </label>
                    <input
                      type="text"
                      value={shortDirection}
                      onChange={(e) => setShortDirection(e.target.value)}
                      placeholder="例如: 女频短篇 婚姻背叛 商业争夺 证据反杀 爽文"
                      disabled={!!shortStoryId}
                      required
                      style={{
                        padding: "8px 12px",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        background: "var(--bg)",
                        color: "var(--text)",
                        fontSize: "12px",
                        fontFamily: "var(--font-serif)",
                        outline: "none",
                        opacity: shortStoryId ? 0.7 : 1,
                      }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                        章节数量 (Chapter Count)*
                      </label>
                      <select
                        value={shortChapters}
                        onChange={(e) => setShortChapters(parseInt(e.target.value, 10))}
                        disabled={!!shortStoryId}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                          fontSize: 12,
                          fontFamily: "var(--font-serif)",
                          outline: "none",
                          cursor: shortStoryId ? "not-allowed" : "pointer",
                          opacity: shortStoryId ? 0.7 : 1,
                        }}
                      >
                        {[12, 13, 14, 15, 16, 17, 18].map((n) => (
                          <option key={n} value={n}>{n} 章</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                        单章目标字数 (Words Target)*
                      </label>
                      <select
                        value={shortChars}
                        onChange={(e) => setShortChars(parseInt(e.target.value, 10))}
                        disabled={!!shortStoryId}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                          fontSize: 12,
                          fontFamily: "var(--font-serif)",
                          outline: "none",
                          cursor: shortStoryId ? "not-allowed" : "pointer",
                          opacity: shortStoryId ? 0.7 : 1,
                        }}
                      >
                        {[900, 1000, 1100, 1200].map((n) => (
                          <option key={n} value={n}>{n} 字/章</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                    <input
                      type="checkbox"
                      id="shortCoverCheckbox"
                      checked={shortCover}
                      onChange={(e) => setShortCover(e.target.checked)}
                      disabled={!!shortStoryId}
                      style={{ cursor: shortStoryId ? "not-allowed" : "pointer", accentColor: "#a78bfa" }}
                    />
                    <label htmlFor="shortCoverCheckbox" style={{ fontSize: 11, color: "var(--text-muted)", cursor: shortStoryId ? "not-allowed" : "pointer", userSelect: "none", opacity: shortStoryId ? 0.7 : 1 }}>
                      🌌 全自动生成配图故事封面 (AI Cover Generation)
                    </label>
                  </div>
                </>
              )}

              {/* Console Output */}
              {isRunningShort && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                    <div style={{
                      width: "12px", height: "12px",
                      border: "2px solid var(--border)", borderTopColor: "#a78bfa",
                      borderRadius: "50%", animation: "spin 1s linear infinite"
                    }} />
                    <span>
                      {shortFictionStage === "idle" || shortFictionStage === "outline"
                        ? "正在运行 步骤一：AI 规划大纲与大纲精修评审..."
                        : shortFictionStage === "draft"
                        ? "正在运行 步骤二：AI 协同批量起草各章节正文..."
                        : "正在运行 步骤三：AI 生成故事简介、卖点与封面提示词，并调用模型生成书封..."}
                    </span>
                  </div>
                  <div
                    ref={shortConsoleRef}
                    style={{
                      height: "220px",
                      background: "#121214",
                      color: "#d4d4d4",
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      padding: "10px 12px",
                      borderRadius: "6px",
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                      lineHeight: "1.5",
                      border: "1px solid var(--border)",
                      textAlign: "left"
                    }}
                  >
                    {shortLogs.map((log, i) => (
                      <div key={i}>{log}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions Footer */}
              <div style={{ display: "flex", gap: 10, borderTop: "1px solid var(--border)", paddingTop: "14px", justifyContent: "flex-end", alignItems: "center" }}>
                {shortStoryId && !isRunningShort && (
                  <button
                    type="button"
                    onClick={() => {
                      setShortStoryId(null);
                      setShortFictionStage("idle");
                      setShortSuccess(null);
                      setShortError(null);
                      setShortLogs([]);
                    }}
                    style={{
                      padding: "0 12px", height: 38,
                      background: "rgba(239, 68, 68, 0.08)",
                      border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 8,
                      color: "#ef4444", fontSize: 11, fontWeight: 500,
                      cursor: "pointer", marginRight: "auto"
                    }}
                  >
                    🔄 重置新故事
                  </button>
                )}

                {isRunningShort ? (
                  <button
                    type="button"
                    disabled
                    style={{
                      padding: "0 20px", height: 38,
                      background: "var(--border)",
                      border: "none", borderRadius: 8,
                      color: "var(--text-muted)", fontSize: 12, fontWeight: 600,
                      cursor: "not-allowed"
                    }}
                  >
                    正在生成中...
                  </button>
                ) : (
                  <>
                    {!shortStoryId && (
                      <button
                        type="button"
                        onClick={() => handleShortRunStep("outline")}
                        disabled={!shortDirection.trim()}
                        style={{
                          padding: "0 20px", height: 38,
                          background: "#a78bfa",
                          border: "none", borderRadius: 8,
                          color: "white", fontSize: 12, fontWeight: 600,
                          cursor: !shortDirection.trim() ? "not-allowed" : "pointer",
                          opacity: !shortDirection.trim() ? 0.6 : 1,
                        }}
                      >
                        🚀 步骤一：生成大纲
                      </button>
                    )}
                    {shortStoryId && shortFictionStage === "draft" && (
                      <button
                        type="button"
                        onClick={() => handleShortRunStep("draft")}
                        style={{
                          padding: "0 20px", height: 38,
                          background: "#8b5cf6",
                          border: "none", borderRadius: 8,
                          color: "white", fontSize: 12, fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        ✍️ 步骤二：批量起草正文
                      </button>
                    )}
                    {shortStoryId && shortFictionStage === "package" && (
                      <button
                        type="button"
                        onClick={() => handleShortRunStep("package")}
                        style={{
                          padding: "0 20px", height: 38,
                          background: "#ec4899",
                          border: "none", borderRadius: 8,
                          color: "white", fontSize: 12, fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        🎨 步骤三：生成封面与包装
                      </button>
                    )}
                  </>
                )}

                {!isRunningShort && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsShortRunModalOpen(false);
                      setShortSuccess(null);
                      setShortError(null);
                    }}
                    style={{
                      padding: "0 16px", height: 38,
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border)", borderRadius: 8,
                      color: "var(--text-muted)", fontSize: 12, fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    {shortFictionStage === "completed" ? "完成" : "关闭"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionTreeItem({
  node,
  selectedSessionId,
  onSelectSession,
  onRenamed,
  onSessionDeleted,
  depth,
}: {
  node: SessionTreeNode;
  selectedSessionId: string | null;
  onSelectSession: (s: SessionInfo) => void;
  onRenamed?: () => void;
  onSessionDeleted?: (id: string) => void;
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div style={{ position: "relative" }}>
        {/* Indent line for child sessions */}
        {depth > 0 && (
          <div style={{
            position: "absolute",
            left: depth * 12 + 6,
            top: 0, bottom: 0,
            width: 1,
            background: "var(--border)",
            pointerEvents: "none",
          }} />
        )}
        <SessionItem
          session={node.session}
          isSelected={node.session.id === selectedSessionId}
          onClick={() => onSelectSession(node.session)}
          onRenamed={onRenamed}
          onDeleted={(id) => onSessionDeleted?.(id)}
          depth={depth}
          hasChildren={hasChildren}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
      </div>
      {hasChildren && !collapsed && (
        <div>
          {node.children.map((child) => (
            <SessionTreeItem
              key={child.session.id}
              node={child}
              selectedSessionId={selectedSessionId}
              onSelectSession={onSelectSession}
              onRenamed={onRenamed}
              onSessionDeleted={onSessionDeleted}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionItem({
  session,
  isSelected,
  onClick,
  onRenamed,
  onDeleted,
  depth = 0,
  hasChildren = false,
  collapsed = false,
  onToggleCollapse,
}: {
  session: SessionInfo;
  isSelected: boolean;
  onClick: () => void;
  onRenamed?: () => void;
  onDeleted?: (id: string) => void;
  depth?: number;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lockedState, setLockedState] = useState(session.locked);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync state if session prop updates
  useEffect(() => {
    setLockedState(session.locked);
  }, [session.locked]);

  const handleLockToggle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = !lockedState;
    setLockedState(newStatus);
    session.locked = newStatus; // optimistic update on reference
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: newStatus }),
      });
      onRenamed?.(); // refresh sidebar list
    } catch {
      setLockedState(!newStatus);
      session.locked = !newStatus;
    }
  }, [lockedState, session, onRenamed]);

  const title = session.name || session.firstMessage.slice(0, 50) || session.id.slice(0, 12);

  const startRename = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameValue(session.name ?? "");
    setRenaming(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [session.name]);

  const commitRename = useCallback(async () => {
    const name = renameValue.trim();
    setRenaming(false);
    if (name === (session.name ?? "")) return;
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      onRenamed?.();
    } catch {
      // ignore
    }
  }, [renameValue, session.id, session.name, onRenamed]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(true);
  }, []);

  const handleDeleteConfirm = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" });
      onDeleted?.(session.id);
    } catch {
      setDeleting(false);
    }
  }, [session.id, onDeleted]);

  const handleDeleteCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  }, []);

  // Fixed-height outer wrapper — content swaps in place so the list never reflows
  const ITEM_HEIGHT = 54;

  return (
    <div
      onClick={confirmDelete || renaming ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
      style={{
        height: ITEM_HEIGHT,
        display: "flex",
        alignItems: "center",
        paddingLeft: depth > 0 ? depth * 12 + 14 : 14,
        paddingRight: 8,
        cursor: confirmDelete || renaming ? "default" : "pointer",
        background: confirmDelete
          ? "rgba(239,68,68,0.06)"
          : isSelected ? "var(--bg-selected)" : hovered ? "var(--bg-hover)" : "transparent",
        borderLeft: confirmDelete
          ? "2px solid #ef4444"
          : isSelected ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "background 0.1s",
        opacity: deleting ? 0.5 : 1,
        gap: 6,
        overflow: "hidden",
      }}
    >
      {confirmDelete ? (
        /* ── Delete confirmation: same height, two flat buttons ── */
        <>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Delete <span style={{ fontWeight: 600 }}>&ldquo;{title.slice(0, 22)}{title.length > 22 ? "…" : ""}&rdquo;</span>?
          </div>
          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
            <button
              onClick={handleDeleteConfirm}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                height: 30, padding: "0 11px",
                background: "#ef4444", border: "none",
                borderRadius: 6, color: "#fff",
                cursor: "pointer", fontSize: 12, fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              Delete
            </button>
            <button
              onClick={handleDeleteCancel}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                height: 30, padding: "0 11px",
                background: "var(--bg)", border: "1px solid var(--border)",
                borderRadius: 6, color: "var(--text-muted)",
                cursor: "pointer", fontSize: 12, fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : renaming ? (
        /* ── Rename: input fills the same row ── */
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          autoFocus
          style={{
            flex: 1,
            fontSize: 12,
            padding: "5px 8px",
            border: "1px solid var(--accent)",
            borderRadius: 5,
            outline: "none",
            background: "var(--bg)",
            color: "var(--text)",
            height: 30,
          }}
        />
      ) : (
        /* ── Normal view ── */
        <>
          {/* Fork indicator for child sessions */}
          {depth > 0 && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: isSelected ? 500 : 400,
                lineHeight: 1.4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--text)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              title={title}
            >
              {lockedState && (
                <span title="本会话已被锁定，无法删除。请先解锁！" style={{ display: "inline-flex", fontSize: 10, flexShrink: 0 }}>🔒</span>
              )}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
            </div>
            <div style={{ marginTop: 2, display: "flex", gap: 8, color: "var(--text-dim)", fontSize: 11 }}>
              <span title={session.modified}>{formatRelativeTime(session.modified)}</span>
              <span>{session.messageCount} msgs</span>
            </div>
          </div>

          {/* Collapse toggle — always visible when has children */}
          {hasChildren && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
              title={collapsed ? "Expand forks" : "Collapse forks"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 20, height: 20, padding: 0, flexShrink: 0,
                background: "none", border: "none",
                color: "var(--text-dim)", cursor: "pointer",
                transform: collapsed ? "rotate(-90deg)" : "none",
                transition: "transform 0.15s",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2 3.5 5 6.5 8 3.5" />
              </svg>
            </button>
          )}

          {/* Action buttons — shown on hover */}
          {hovered && (
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {/* Lock/Unlock Toggle Button */}
              <button
                onClick={handleLockToggle}
                title={lockedState ? "解锁会话 (Unlock session)" : "锁定会话 (Lock session)"}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, padding: 0,
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 7,
                  color: lockedState ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer", flexShrink: 0,
                  transition: "background 0.12s, color 0.12s, border-color 0.12s",
                  borderColor: lockedState ? "rgba(37,99,235,0.25)" : "var(--border)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-selected)";
                  e.currentTarget.style.color = "var(--accent)";
                  e.currentTarget.style.borderColor = "rgba(37,99,235,0.35)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = lockedState ? "var(--accent)" : "var(--text-muted)";
                  e.currentTarget.style.borderColor = lockedState ? "rgba(37,99,235,0.25)" : "var(--border)";
                }}
              >
                {lockedState ? (
                  /* Padlock Locked Icon */
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ) : (
                  /* Padlock Unlocked Icon */
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                )}
              </button>
              <button
                onClick={startRename}
                title="Rename"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, padding: 0,
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 7, color: "var(--text-muted)",
                  cursor: "pointer", flexShrink: 0,
                  transition: "background 0.12s, color 0.12s, border-color 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-selected)";
                  e.currentTarget.style.color = "var(--accent)";
                  e.currentTarget.style.borderColor = "rgba(37,99,235,0.35)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-muted)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </button>
              <button
                onClick={lockedState ? undefined : handleDeleteClick}
                disabled={lockedState}
                title={lockedState ? "本会话已被锁定，无法删除。请先解锁！" : "Delete"}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, padding: 0,
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 7,
                  color: lockedState ? "var(--text-dim)" : "var(--text-muted)",
                  cursor: lockedState ? "not-allowed" : "pointer",
                  flexShrink: 0,
                  opacity: lockedState ? 0.35 : 1,
                  transition: "background 0.12s, color 0.12s, border-color 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (lockedState) return;
                  e.currentTarget.style.background = "rgba(239,68,68,0.08)";
                  e.currentTarget.style.color = "#ef4444";
                  e.currentTarget.style.borderColor = "rgba(239,68,68,0.35)";
                }}
                onMouseLeave={(e) => {
                  if (lockedState) return;
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-muted)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
