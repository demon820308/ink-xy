"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SessionInfo, GemProfile } from "@/lib/types";
import { StatusIcon } from "./StatusIcon";
import { Emoji } from "./Emoji";

interface Genre {
  id: string;
  name: string;
  source: string;
  profile?: {
    language?: string;
  };
}

interface WriteResult {
  chapterNumber?: number;
  title?: string;
  wordCount?: number;
  revised?: boolean;
  status?: string;
  auditResult?: {
    passed?: boolean;
    issues?: Array<{
      severity?: string;
      category?: string;
      description?: string;
      suggestion?: string;
    }>;
  };
}

interface StreamResult {
  success: boolean;
  error?: string;
  stdout?: string;
  stderr?: string;
  chapterNumber?: number;
  [key: string]: unknown;
}
import { FileExplorer } from "./FileExplorer";
import { encodeFilePathForApi, joinFilePath } from "@/lib/file-paths";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Refactored Components & Utilities
import { StudioTitle } from "./StudioTitle";
import { SessionTreeItem } from "./SessionTree";
import { shortenCwd, buildSessionTree, getRecentCwds } from "@/lib/session-utils";

// Refactored Modals
import BookCreateModal from "./BookCreateModal";
import BookDeleteModal from "./BookDeleteModal";
import ImportModal from "./ImportModal";
import FanficRefreshModal from "./FanficRefreshModal";
import ConsolidationModal from "./ConsolidationModal";
import RadarModal from "./RadarModal";
import ShortRunModal from "./ShortRunModal";
import GemEditorModal from "./GemEditorModal";

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
  onWorkspaceStatusChange?: (
    isInkos: boolean,
    hasBooks: boolean,
    hasChapters: boolean,
    maxChapterNum: number,
    latestChapterPath: string | null,
    latestChapterName: string | null
  ) => void;
  onActiveBookChange?: (bookId: string | null) => void;
  genresRefreshKey?: number;
}

export function SessionSidebar({
  selectedSessionId,
  onSelectSession,
  onNewSession,
  initialSessionId,
  onInitialRestoreDone,
  refreshKey,
  onSessionDeleted,
  selectedCwd: selectedCwdProp,
  onCwdChange,
  onOpenFile,
  explorerRefreshKey,
  onAtMention,
  activeGemId,
  availableStyles = [],
  onStylesChange,
  onWorkspaceStatusChange,
  onActiveBookChange,
  genresRefreshKey = 0
}: Props) {
  // Base states
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

  // Gem states
  const [gems, setGems] = useState<GemProfile[]>([]);
  const [modelList, setModelList] = useState<{ id: string; name: string; provider: string }[]>([]);
  const [defaultModel, setDefaultModel] = useState<{ provider: string; modelId: string } | null>(null);
  const [isGemModalOpen, setIsGemModalOpen] = useState(false);
  const [editingGemId, setEditingGemId] = useState<string | null>(null);
  const [gemsExpanded, setGemsExpanded] = useState(true);
  const [sessionsExpanded, setSessionsExpanded] = useState(false);

  // InkOS Workspace states
  const [isInkosWorkspace, setIsInkosWorkspace] = useState(true);
  const [hasBooks, setHasBooks] = useState(true);
  // hasShorts is updated during workspace checks (shorts/ folder detection)
  const [, setHasShorts] = useState(false);
  const [showImportDraft, setShowImportDraft] = useState(true);
  const [showAutoGenerateShort, setShowAutoGenerateShort] = useState(true);
  const [showCreateBookCard, setShowCreateBookCard] = useState(true);
  const [disableDefaultAgentEditDelete, setDisableDefaultAgentEditDelete] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Modals Visibility
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [isDeleteBookModalOpen, setIsDeleteBookModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isFanficRefreshModalOpen, setIsFanficRefreshModalOpen] = useState(false);
  const [isConsolidationModalOpen, setIsConsolidationModalOpen] = useState(false);
  const [isRadarModalOpen, setIsRadarModalOpen] = useState(false);
  const [isShortRunModalOpen, setIsShortRunModalOpen] = useState(false);

  // Workspace status info
  const [hasChapters, setHasChapters] = useState(false);
  const [maxChapterNum, setMaxChapterNum] = useState<number>(0);
  const [latestChapterPath, setLatestChapterPath] = useState<string | null>(null);
  const [latestChapterName, setLatestChapterName] = useState<string | null>(null);
  const [hasFirstChapterBlueprint, setHasFirstChapterBlueprint] = useState(false);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [availableBooks, setAvailableBooks] = useState<string[]>([]);
  const [registeredCwd, setRegisteredCwd] = useState<string | null>(null);
  const [validRecentCwds, setValidRecentCwds] = useState<string[]>([]);
  const [recentCwdsChecked, setRecentCwdsChecked] = useState(false);
  const [chapterStatusMap, setChapterStatusMap] = useState<Record<number, string>>({});

  // Fanfiction states
  const [isFanfic, setIsFanfic] = useState(false);
  const [activeFanficMode, setActiveFanficMode] = useState<string | null>(null);

  // Consolidation advice
  const [consolidationRecommend, setConsolidationRecommend] = useState(false);
  const [recommendVolumeName, setRecommendVolumeName] = useState<string>("");

  // Writing execution states (Kept in parent as they trigger the core workflow in sidebar and report modal)
  const [isWriteLoading, setIsWriteLoading] = useState(false);
  // writeProgressText drives the progress label shown during write operations
  const [writeProgressText, setWriteProgressText] = useState("");
  const [writeReportTitle, setWriteReportTitle] = useState("");
  const [writeReportContent, setWriteReportContent] = useState("");
  const [isWriteReportOpen, setIsWriteReportOpen] = useState(false);
  const [lastWriteResult, setLastWriteResult] = useState<WriteResult | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [writeError, setWriteError] = useState<string | null>(null);

  const consoleRef = useRef<HTMLDivElement>(null);
  const activeBookIdRef = useRef<string | null>(null);

  // Dynamic genres
  const [dynamicGenres, setDynamicGenres] = useState<Genre[]>([]);

  useEffect(() => {
    activeBookIdRef.current = activeBookId;
    onActiveBookChange?.(activeBookId);
  }, [activeBookId, onActiveBookChange]);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  // Load genres list
  useEffect(() => {
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd) return;
    const loadGenres = async () => {
      try {
        const res = await fetch(`/api/genres?cwd=${encodeURIComponent(activeCwd)}`);
        const data = await res.json();
        if (res.ok && data.success) {
          setDynamicGenres(data.genres || []);
        }
      } catch (err) {
        console.error("[SessionSidebar] Failed to load genres:", err);
      }
    };
    loadGenres();
  }, [selectedCwdProp, selectedCwd, genresRefreshKey]);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const importVal = localStorage.getItem("ink-show-import-draft");
    if (importVal !== null) {
      setShowImportDraft(importVal === "true");
    }
    const autoShortVal = localStorage.getItem("ink-show-auto-generate-short");
    if (autoShortVal !== null) {
      setShowAutoGenerateShort(autoShortVal === "true");
    }
    const createBookVal = localStorage.getItem("ink-show-create-book-card");
    if (createBookVal !== null) {
      setShowCreateBookCard(createBookVal === "true");
    }
    const disableDefaultAgentVal = localStorage.getItem("ink-disable-default-agent-edit-delete");
    if (disableDefaultAgentVal !== null) {
      setDisableDefaultAgentEditDelete(disableDefaultAgentVal === "true");
    }

    const handleSettings = (e: Event) => {
      const customEvent = e as CustomEvent<{
        showImportDraft?: boolean;
        showAutoGenerateShort?: boolean;
        showCreateBookCard?: boolean;
        disableDefaultAgentEditDelete?: boolean;
      }>;
      if (customEvent.detail) {
        if (typeof customEvent.detail.showImportDraft === "boolean") {
          setShowImportDraft(customEvent.detail.showImportDraft);
        }
        if (typeof customEvent.detail.showAutoGenerateShort === "boolean") {
          setShowAutoGenerateShort(customEvent.detail.showAutoGenerateShort);
        }
        if (typeof customEvent.detail.showCreateBookCard === "boolean") {
          setShowCreateBookCard(customEvent.detail.showCreateBookCard);
        }
        if (typeof customEvent.detail.disableDefaultAgentEditDelete === "boolean") {
          setDisableDefaultAgentEditDelete(customEvent.detail.disableDefaultAgentEditDelete);
        }
      }
    };
    window.addEventListener("ink-settings-changed", handleSettings);
    return () => {
      window.removeEventListener("ink-settings-changed", handleSettings);
    };
  }, []);

  // Check workspace structure and status
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
        setMaxChapterNum(0);
        setLatestChapterPath(null);
        setLatestChapterName(null);
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
        (e: { name: string }) => e.name === ".inkos" || e.name === "story" || e.name === "books"
      );
      setIsInkosWorkspace(hasSignature);

      if (hasSignature) {
        const booksDir = joinFilePath(cwd, "books");
        const booksEncoded = encodeFilePathForApi(booksDir);
        const booksRes = await fetch(`/api/files/${booksEncoded}?type=list&check=true`);
        if (booksRes.ok) {
          const booksData = await booksRes.json();
          const bookEntries = booksData.exists === false ? [] : (booksData.entries || []);
          const actualBooks = bookEntries.filter((e: { name: string }) => e.name !== ".gitkeep" && !e.name.startsWith("."));
          const hasBooksVal = actualBooks.length > 0;
          setHasBooks(hasBooksVal);
          const bookNames = actualBooks.map((e: { name: string }) => e.name);
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

            // Check fanfic mode
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
            let latestPath: string | null = null;
            let latestName: string | null = null;
            if (chaptersRes.ok) {
              const chaptersData = await chaptersRes.json();
              const chapterEntries = chaptersData.entries || [];
              const mdFiles = chapterEntries.filter(
                (e: { isDir: boolean; name: string }) => !e.isDir && e.name.endsWith(".md") && /^\d{4}/.test(e.name)
              );
              setHasChapters(mdFiles.length > 0);

              const fileNumbers = mdFiles.map((f: { name: string }) => {
                const m = f.name.match(/^(\d+)/);
                return m ? parseInt(m[1], 10) : 0;
              }).filter((n: number) => n > 0);
              maxChapter = fileNumbers.length > 0 ? Math.max(...fileNumbers) : 0;

              const sortedMdFiles = [...mdFiles].sort((a, b) => a.name.localeCompare(b.name));
              const latestFile = sortedMdFiles[sortedMdFiles.length - 1];
              if (latestFile) {
                latestPath = joinFilePath(chaptersDir, latestFile.name);
                latestName = latestFile.name;
              }
            } else {
              setHasChapters(false);
            }
            setMaxChapterNum(maxChapter);
            setLatestChapterPath(latestPath);
            setLatestChapterName(latestName);

            // Check Chapter 1 plan
            let hasPlan = false;
            try {
              const planPath = joinFilePath(cwd, `books/${selectedBook}/story/runtime/chapter-0001.plan.md`);
              const planEncoded = encodeFilePathForApi(planPath);
              const planRes = await fetch(`/api/files/${planEncoded}?type=read&check=true`);
              if (planRes.ok) {
                const data = await planRes.json();
                if (data.exists !== false) {
                  hasPlan = true;
                }
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
              const newRes = await fetch(`/api/files/${newEncoded}?type=read&check=true`);
              if (newRes.ok) {
                const fileData = await newRes.json();
                if (fileData && fileData.content) volumeMapText = fileData.content;
              }
              if (!volumeMapText.trim()) {
                const legacyPath = joinFilePath(cwd, `books/${selectedBook}/story/volume_outline.md`);
                const legacyEncoded = encodeFilePathForApi(legacyPath);
                const legacyRes = await fetch(`/api/files/${legacyEncoded}?type=read&check=true`);
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
                const volSummariesRes = await fetch(`/api/files/${volSummariesEncoded}?type=read&check=true`);
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

            // Fetch styles list
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

            // Load chapter index status map
            const indexPath = joinFilePath(cwd, `books/${selectedBook}/chapters/index.json`);
            const indexEncoded = encodeFilePathForApi(indexPath);
            const indexRes = await fetch(`/api/files/${indexEncoded}?type=read&check=true`);
            if (indexRes.ok) {
              try {
                const indexData = await indexRes.json();
                if (indexData.exists !== false && indexData.content) {
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
                } else {
                  setChapterStatusMap({});
                }
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
            setMaxChapterNum(0);
            setLatestChapterPath(null);
            setLatestChapterName(null);
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
          setMaxChapterNum(0);
          setLatestChapterPath(null);
          setLatestChapterName(null);
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
        setMaxChapterNum(0);
        setLatestChapterPath(null);
        setLatestChapterName(null);
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

  // Sync selected CWD changes with backend check
  useEffect(() => {
    const activeCwd = selectedCwdProp || selectedCwd;
    if (activeCwd) {
      setRegisteredCwd(activeCwd);
      checkWorkspaceStatus(activeCwd);
    } else {
      setRegisteredCwd(null);
      setIsInkosWorkspace(true);
    }
  }, [selectedCwdProp, selectedCwd, checkWorkspaceStatus, explorerKey]);

  // Load Gems (Custom Agents)
  const loadGems = useCallback(async () => {
    try {
      const res = await fetch("/api/gem-xy");
      if (!res.ok) throw new Error("Failed to load Gem-xY profiles");
      const data = await res.json() as GemProfile[];
      setGems(data.filter((g) => g.name !== "Gem-xY 文案助手"));
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
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd) return;
    const tempId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    onNewSession?.(tempId, activeCwd, gemId);
  }, [selectedCwdProp, selectedCwd, onNewSession]);

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

  // Load chats sessions
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

  // Check existence of recent cwds
  useEffect(() => {
    const rawCwds = getRecentCwds(allSessions);
    let customCwds: string[] = [];
    try {
      const stored = localStorage.getItem("ink-xy-recent-cwds");
      if (stored) {
        customCwds = JSON.parse(stored);
      }
    } catch {}
    if (!Array.isArray(customCwds)) customCwds = [];

    let deletedCwds: string[] = [];
    try {
      const deletedStored = localStorage.getItem("ink-xy-deleted-cwds");
      if (deletedStored) {
        deletedCwds = JSON.parse(deletedStored);
      }
    } catch {}
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
          } catch {}
          return { cwd, exists: false };
        })
      );
      const valid = results.filter(r => r.exists).map(r => r.cwd);
      setValidRecentCwds(valid);
      setRecentCwdsChecked(true);
    };
    checkAll();
  }, [allSessions, selectedCwd, explorerKey]);

  // Auto-select CWD on first load
  useEffect(() => {
    if (allSessions.length === 0) return;

    if (selectedCwd === null) {
      if (initialSessionId && !restoredRef.current) {
        restoredRef.current = true;
        const target = allSessions.find((s) => s.id === initialSessionId);
        if (target) {
          setSelectedCwd(target.cwd);
          onSelectSession(target, true);
          return;
        }
        onInitialRestoreDone?.();
      }

      if (recentCwdsChecked) {
        if (validRecentCwds.length > 0) {
          setSelectedCwd(validRecentCwds[0]);
        } else {
          fetch("/api/default-cwd", { method: "POST" })
            .then((res) => res.json())
            .then((data: { cwd?: string }) => {
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

    try {
      const stored = localStorage.getItem("ink-xy-recent-cwds");
      if (stored) {
        const list: string[] = JSON.parse(stored);
        if (Array.isArray(list)) {
          const updated = list.filter((c) => c !== cwdToDelete);
          localStorage.setItem("ink-xy-recent-cwds", JSON.stringify(updated));
        }
      }
    } catch (e) {
      console.error("Failed to remove CWD from localStorage:", e);
    }

    setValidRecentCwds((prev) => prev.filter((c) => c !== cwdToDelete));

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

  // Close CWD dropdown on outside click
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
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd) return;
    const tempId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    onNewSession?.(tempId, activeCwd);
  }, [selectedCwdProp, selectedCwd, onNewSession]);

  // Initialize workspace directory structures
  const handleInitWorkspace = async () => {
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd) return;

    setIsInitializing(true);
    setInitError(null);
    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "init",
          cwd: activeCwd,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }
      setIsInkosWorkspace(true);
      await checkWorkspaceStatus(activeCwd);
      setExplorerKey((k) => k + 1);
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setInitError(errMsg || String(err));
    } finally {
      setIsInitializing(false);
    }
  };

  // Switch book writing style guideline
  const handleStyleSwitch = useCallback(async (styleName: string) => {
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd || !activeBookId) return;

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
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      alert(`切换文风失败: ${errMsg}`);
    }
  }, [selectedCwdProp, selectedCwd, activeBookId, availableStyles, onStylesChange]);

  useEffect(() => {
    const handleTriggerRadar = () => {
      setIsRadarModalOpen(true);
    };

    const handleTriggerStyleSwitch = (e: Event) => {
      const customEvent = e as CustomEvent<{ styleName: string }>;
      if (customEvent.detail && customEvent.detail.styleName) {
        handleStyleSwitch(customEvent.detail.styleName);
      }
    };

    window.addEventListener("trigger-radar", handleTriggerRadar);
    window.addEventListener("trigger-style-switch", handleTriggerStyleSwitch);

    return () => {
      window.removeEventListener("trigger-radar", handleTriggerRadar);
      window.removeEventListener("trigger-style-switch", handleTriggerStyleSwitch);
    };
  }, [handleStyleSwitch]);

  // Plan blueprint for chapter 1
  const handlePlanBlueprint = async () => {
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd || !activeBookId) return;

    setIsWriteLoading(true);
    setWriteProgressText("正在为您规划首章蓝图，请稍候...");
    setWriteReportTitle("");
    setWriteReportContent("");
    setLogs([]);
    setWriteError(null);

    let hasError = false;
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
      setWriteReportContent("已成功规划首章大纲与大纲意图栈！\n已在 books/" + activeBookId + "/story/runtime/ chapter-0001.plan.md。接下来，您可以点击“智能写作”按钮以起草正文。");
      setIsWriteReportOpen(true);
      window.dispatchEvent(new CustomEvent("refresh-explorer"));
      await checkWorkspaceStatus(activeCwd);
    } catch (err) {
      hasError = true;
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setWriteError(message);
    } finally {
      if (!hasError) {
        setIsWriteLoading(false);
      }
    }
  };

  // Start Drafting chapters
  const handleStartWriting = async () => {
    const activeCwd = selectedCwdProp || selectedCwd;
    if (!activeCwd || !activeBookId) return;

    setIsWriteLoading(true);
    setWriteProgressText("正在为您规划大纲并起草首章正文，请稍候...");
    setWriteReportTitle("");
    setWriteReportContent("");
    setLogs([]);
    setWriteError(null);

    let hasError = false;
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
      let finalResult: StreamResult | null = null;

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
          } catch (e) {
            console.error("Failed to parse stream chunk:", e);
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
            } catch {}
          }
          if (!errMsg && finalResult.stderr) {
            errMsg = finalResult.stderr.trim();
          }
        }
        throw new Error(errMsg || "首章创作执行失败");
      }

      let result: WriteResult | null = null;
      if (finalResult && typeof finalResult.chapterNumber === "number") {
        result = finalResult as unknown as WriteResult;
      } else {
        try {
          const parsed = JSON.parse(finalResult.stdout || "{}");
          result = Array.isArray(parsed) ? parsed[0] : parsed;
        } catch (e) {
          console.error("Failed to parse write-next JSON output:", e);
          setWriteReportContent(finalResult.stdout || "首章起草成功！");
          setWriteReportTitle("首章起草完成");
          setIsWriteReportOpen(true);
          window.dispatchEvent(new CustomEvent("refresh-explorer"));
          await checkWorkspaceStatus(activeCwd);
          return;
        }
      }

      if (!result) {
        throw new Error("未返回有效的创作章节结果。");
      }

      const paddedNum = String(result.chapterNumber).padStart(4, "0");
      const chaptersDir = `${activeCwd}/books/${activeBookId}/chapters`;
      const listRes = await fetch(`/api/files/${encodeFilePathForApi(chaptersDir)}?type=list`);
      const listData = await listRes.json();
      const found = listData.entries?.find((e: { name: string; isDir: boolean }) => !e.isDir && e.name.startsWith(paddedNum));

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
          ? issues.map((issue: { severity?: string; category?: string; description?: string; suggestion?: string }) => {
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
      setLastWriteResult(result);
      setIsWriteReportOpen(true);

      window.dispatchEvent(new CustomEvent("refresh-explorer"));
      await checkWorkspaceStatus(activeCwd);
    } catch (err: unknown) {
      hasError = true;
      console.error(err);
      const isTimeout = (err instanceof Error && (err.message.includes("超时") || err.message.includes("timed out"))) || logs.some(l => l.includes("超时"));
      if (isTimeout) {
        setWriteError("任务运行超时（已超过 1800 秒）。建议在右上角「模型配置」中，更换速度较快且稳定的标准模型（例如将 reasoning/思索模型切换为标准对话模型），并检查您的 API Key 与接口代理连接状态。");
      } else {
        const errMsg = err instanceof Error ? err.message : String(err);
        setWriteError(errMsg || String(err));
      }
    } finally {
      if (!hasError) {
        setIsWriteLoading(false);
      }
    }
  };

  useEffect(() => {
    onWorkspaceStatusChange?.(
      isInkosWorkspace, 
      hasBooks, 
      hasChapters, 
      maxChapterNum, 
      latestChapterPath, 
      latestChapterName
    );
  }, [isInkosWorkspace, hasBooks, hasChapters, maxChapterNum, latestChapterPath, latestChapterName, onWorkspaceStatusChange]);

  const activeCwd = selectedCwdProp || selectedCwd;
  const filteredSessions = activeCwd
    ? allSessions.filter((s) => s.cwd === activeCwd)
    : allSessions;

  const sessionTree = buildSessionTree(filteredSessions);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 10px 10px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <StudioTitle />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={handleNewSession}
              disabled={!activeCwd}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                background: "var(--bg-hover)", border: "1px solid var(--border)",
                color: activeCwd ? "var(--text-muted)" : "var(--text-dim)",
                cursor: activeCwd ? "pointer" : "not-allowed",
                height: 32, paddingLeft: 10, paddingRight: 12, borderRadius: 7,
                fontSize: 12, fontWeight: 500, letterSpacing: "-0.01em", flexShrink: 0,
                transition: "background 0.12s, color 0.12s, border-color 0.12s",
              }}
              title={activeCwd ? `在新协同会话中写作` : "请先选择创作工作区"}
              onMouseEnter={(e) => {
                if (!activeCwd) return;
                e.currentTarget.style.background = "var(--bg-selected)";
                e.currentTarget.style.color = "var(--accent)";
                e.currentTarget.style.borderColor = "rgba(37,99,235,0.35)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = activeCwd ? "var(--text-muted)" : "var(--text-dim)";
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
                cursor: "pointer", width: 32, height: 32, borderRadius: 7, padding: 0, flexShrink: 0,
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

        {/* CWD Picker */}
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            style={{
              width: "100%", display: "flex", alignItems: "center", padding: "6px 10px",
              background: activeCwd ? "var(--bg-hover)" : "rgba(37,99,235,0.06)",
              border: activeCwd ? "1px solid var(--border)" : "1px solid rgba(37,99,235,0.4)",
              borderRadius: 7, cursor: "pointer", fontSize: 12, color: "var(--text)", textAlign: "left",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <span
              style={{
                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                fontFamily: "var(--font-mono)", fontSize: 11,
                color: activeCwd ? "var(--text)" : "var(--text-dim)",
              }}
              title={activeCwd ?? ""}
            >
              {activeCwd ? shortenCwd(activeCwd, homeDir) : (initialSessionId && !restoredRef.current ? "" : "选择创作目录…")}
            </span>
          </button>

          {dropdownOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100,
              background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
              boxShadow: "0 6px 20px rgba(0,0,0,0.10)", overflow: "hidden",
            }}>
              {validRecentCwds.map((cwd) => (
                <div
                  key={cwd}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                    background: cwd === activeCwd ? "var(--bg-selected)" : "none",
                    borderBottom: "1px solid var(--border)", transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (cwd !== activeCwd) e.currentTarget.style.background = "var(--bg-panel)";
                  }}
                  onMouseLeave={(e) => {
                    if (cwd !== activeCwd) e.currentTarget.style.background = "none";
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
                      display: "flex", alignItems: "center", gap: 7, flex: 1, padding: "8px 10px",
                      background: "none", border: "none",
                      color: cwd === activeCwd ? "var(--text)" : "var(--text-muted)",
                      cursor: "pointer", textAlign: "left", fontSize: 11, fontFamily: "var(--font-mono)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                    title={cwd}
                  >
                    {cwd === activeCwd && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polyline points="1.5 5 4 7.5 8.5 2.5" />
                      </svg>
                    )}
                    {cwd !== activeCwd && <span style={{ width: 10, flexShrink: 0 }} />}
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortenCwd(cwd, homeDir)}</span>
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteRecentCwd(cwd); }}
                    title="从列表中移除该路径"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20,
                      marginRight: 6, background: "none", border: "none", color: "var(--text-dim)",
                      cursor: "pointer", borderRadius: 4, transition: "color 0.2s, background 0.2s",
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
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}

              {!customPathOpen && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDefaultCwd(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 10px",
                    background: "none", border: "none",
                    borderTop: validRecentCwds.length > 0 ? "1px solid var(--border)" : "none",
                    color: "var(--text-muted)", cursor: "pointer", textAlign: "left", fontSize: 11,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
                  </svg>
                  <span>使用默认创作目录</span>
                </button>
              )}

              {!customPathOpen ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCustomPathOpen(true);
                    setTimeout(() => customPathInputRef.current?.focus(), 0);
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 10px",
                    background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", textAlign: "left", fontSize: 11,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" style={{ flexShrink: 0 }}>
                    <line x1="5" y1="1" x2="5" y2="9" /><line x1="1" y1="5" x2="9" y2="5" />
                  </svg>
                  <span>自定义路径…</span>
                </button>
              ) : (
                <div style={{ padding: "6px 8px" }}>
                  <input
                    ref={customPathInputRef}
                    value={customPathValue}
                    onChange={(e) => setCustomPathValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitCustomPath();
                      if (e.key === "Escape") { setCustomPathOpen(false); setCustomPathValue(""); }
                    }}
                    placeholder="/path/to/project"
                    style={{
                      width: "100%", fontSize: 11, fontFamily: "var(--font-mono)", padding: "5px 8px",
                      border: "1px solid var(--accent)", borderRadius: 5, outline: "none",
                      background: "var(--bg)", color: "var(--text)", boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                    <button
                      onClick={commitCustomPath}
                      style={{
                        flex: 1, padding: "4px 0", background: "var(--accent)", border: "none",
                        borderRadius: 5, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      打开
                    </button>
                    <button
                      onClick={() => { setCustomPathOpen(false); setCustomPathValue(""); }}
                      style={{
                        flex: 1, padding: "4px 0", background: "var(--bg-hover)", border: "1px solid var(--border)",
                        borderRadius: 5, color: "var(--text-muted)", fontSize: 11, cursor: "pointer",
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

      {/* File Explorer (main focus area) */}
      {activeCwd && (
        <div style={{
          borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column",
          flex: explorerOpen ? "1 1 0" : "0 0 auto", minHeight: 0, overflow: "hidden",
        }}>
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <button
              onClick={() => setExplorerOpen((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6, flex: 1, padding: "8px 10px",
                background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer",
                fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", textAlign: "left",
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
                    onClick={() => window.dispatchEvent(new CustomEvent("trigger-export-panel"))}
                    title="分卷与一键导出 (Volume Planner & Export)"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 26, height: 26, padding: 0, background: "none", border: "none",
                      color: "var(--text-dim)", cursor: "pointer", borderRadius: 5, flexShrink: 0,
                      transition: "color 0.3s, background 0.3s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none"; }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </button>
                )}
                {isFanfic && (
                  <button
                    onClick={() => setIsFanficRefreshModalOpen(true)}
                    title="刷新同人原作背景设定 (Refresh Fanfic Canon)"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 26, height: 26, padding: 0, background: "none", border: "none",
                      color: "var(--text-dim)", cursor: "pointer", borderRadius: 5, flexShrink: 0,
                      transition: "color 0.3s, background 0.3s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none"; }}
                  >
                    <span style={{ fontSize: 13 }}>🎬</span>
                  </button>
                )}
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  title="导入设定或旧章原稿 (Import Canon/Chapters)"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 26, height: 26, padding: 0, marginRight: 6, background: "none", border: "none",
                    color: "var(--text-dim)", cursor: "pointer", borderRadius: 5, flexShrink: 0,
                    transition: "color 0.3s, background 0.3s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none"; }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
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
                background: explorerRefreshDone ? "rgba(74,222,128,0.18)" : "none", border: "none",
                color: explorerRefreshDone ? "#4ade80" : "var(--text-dim)", cursor: "pointer",
                borderRadius: 5, flexShrink: 0, transition: "color 0.3s, background 0.3s",
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
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
                </svg>
              )}
            </button>
          </div>
          
          {explorerOpen && (
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
              {!isInkosWorkspace && (
                <div style={{
                  margin: "8px 10px", padding: "12px", background: "var(--bg-panel)",
                  border: "1px dashed var(--accent)", borderRadius: "8px", fontSize: "11px", fontFamily: "var(--font-serif)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                    <span style={{ fontSize: 13 }}>✒️</span>
                    <span>未初始化的创作空间</span>
                  </div>
                  <div style={{ color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 8 }}>
                    该目录尚未创建 InkOS 小说项目结构。一键初始化以启用自动章节规划、人设审计与快照防崩系统。
                  </div>
                  {initError && <div style={{ color: "#ef4444", marginBottom: 8, fontSize: 10 }}>⚠️ {initError}</div>}
                  <button
                    onClick={handleInitWorkspace}
                    disabled={isInitializing}
                    style={{
                      width: "100%", padding: "6px 0", background: "var(--accent)", border: "none", borderRadius: "6px",
                      color: "white", fontWeight: 600, cursor: isInitializing ? "not-allowed" : "pointer",
                      opacity: isInitializing ? 0.7 : 1, textAlign: "center", transition: "opacity 0.15s",
                    }}
                  >
                    {isInitializing ? "正在开启小说宇宙..." : "一键开启创作宇宙"}
                  </button>
                </div>
              )}

              {isInkosWorkspace && (!hasBooks || showCreateBookCard) && (
                <div style={{
                  margin: "8px 10px", padding: "12px", background: "var(--bg-panel)",
                  border: "1px dashed var(--accent)", borderRadius: "8px", fontSize: "11px", fontFamily: "var(--font-serif)",
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
                        flex: 1, padding: "6px 0", background: "var(--accent)", border: "none", borderRadius: "6px",
                        color: "white", fontWeight: 600, cursor: "pointer", textAlign: "center", fontSize: "11px", transition: "opacity 0.15s",
                      }}
                    >
                      {hasBooks ? "➕ 创建新书籍" : "✍️ 创建小说书籍"}
                    </button>
                    {!hasBooks && showImportDraft && (
                      <button
                        onClick={() => setIsImportModalOpen(true)}
                        style={{
                          flex: 1, padding: "6px 0", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "6px",
                          color: "var(--text)", fontWeight: 600, cursor: "pointer", textAlign: "center", fontSize: "11px", transition: "opacity 0.15s",
                        }}
                      >
                        📥 导入已有旧稿
                      </button>
                    )}
                  </div>
                  {!hasBooks && showAutoGenerateShort && (
                    <button
                      onClick={() => setIsShortRunModalOpen(true)}
                      style={{
                        width: "100%", marginTop: 8, padding: "6px 0", background: "rgba(139, 92, 246, 0.08)",
                        border: "1px solid rgba(139, 92, 246, 0.3)", borderRadius: "6px", color: "#a78bfa",
                        fontWeight: 600, cursor: "pointer", textAlign: "center", fontSize: "11px", transition: "all 0.15s",
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
                  margin: "8px 10px", padding: "12px", background: "var(--bg-panel)",
                  border: "1px dashed var(--accent)", borderRadius: "8px", fontSize: "11px", fontFamily: "var(--font-serif)",
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
                          flex: 1, padding: "6px 0", background: "var(--accent)", border: "none", borderRadius: "6px",
                          color: "white", fontWeight: 600, cursor: isWriteLoading ? "not-allowed" : "pointer",
                          textAlign: "center", fontSize: "11px", transition: "opacity 0.15s",
                        }}
                      >
                        规划首章蓝图
                      </button>
                    ) : (
                      <button
                        onClick={handleStartWriting}
                        disabled={isWriteLoading}
                        style={{
                          flex: 1, padding: "6px 0", background: "var(--accent)", border: "none", borderRadius: "6px",
                          color: "white", fontWeight: 600, cursor: isWriteLoading ? "not-allowed" : "pointer",
                          textAlign: "center", fontSize: "11px", transition: "opacity 0.15s",
                        }}
                      >
                        ✍️ 智能写作
                      </button>
                    )}
                    {showImportDraft && (
                      <button
                        onClick={() => setIsImportModalOpen(true)}
                        disabled={isWriteLoading}
                        style={{
                          flex: 1, padding: "6px 0", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "6px",
                          color: "var(--text)", fontWeight: 600, cursor: isWriteLoading ? "not-allowed" : "pointer",
                          textAlign: "center", fontSize: "11px", transition: "opacity 0.15s",
                        }}
                      >
                        📥 导入已有旧稿
                      </button>
                    )}
                  </div>
                  {showAutoGenerateShort && (
                    <button
                      onClick={() => setIsShortRunModalOpen(true)}
                      style={{
                        width: "calc(100% - 20px)", margin: "8px 10px 0 10px", padding: "6px 0", background: "rgba(139, 92, 246, 0.08)",
                        border: "1px solid rgba(139, 92, 246, 0.3)", borderRadius: "6px", color: "#a78bfa",
                        fontWeight: 600, cursor: "pointer", textAlign: "center", fontSize: "11px", transition: "all 0.15s",
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

              {registeredCwd === activeCwd && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
                  {/* Active Book Selector Panel */}
                  <div style={{
                    margin: "8px 10px", padding: "8px 10px", background: "var(--bg-panel)", border: "1px solid var(--border)",
                    borderRadius: "8px", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px",
                    fontFamily: "var(--font-serif)", flexShrink: 0
                  }}>
                    <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>当前书籍:</span>
                    <select
                      value={activeBookId || ""}
                      onChange={(e) => {
                        const newActive = e.target.value;
                        setActiveBookId(newActive);
                        checkWorkspaceStatus(activeCwd, newActive);
                      }}
                      style={{
                        flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "5px",
                        padding: "3px 6px", fontSize: "12px", fontFamily: "var(--font-serif)", color: "var(--text)",
                        outline: "none", cursor: "pointer", minWidth: 0,
                      }}
                    >
                      {availableBooks.map((book) => (
                        <option key={book} value={book}>{book}</option>
                      ))}
                    </select>

                    {activeBookId && onOpenFile && (
                      <button
                        onClick={() => onOpenFile(`hooks:${activeBookId}`, `🪝 ${activeBookId} 伏笔`)}
                        title="剧情伏笔脉络墙 (Plot Hooks Board)"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, padding: 0,
                          background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", borderRadius: 4,
                          transition: "color 0.2s, background-color 0.2s"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "var(--accent)";
                          e.currentTarget.style.background = "rgba(249, 115, 22, 0.08)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--text-dim)";
                          e.currentTarget.style.background = "none";
                        }}
                      >
                        <span style={{ fontSize: 13 }}>🪝</span>
                      </button>
                    )}
                    
                    <button
                      onClick={() => setIsDeleteBookModalOpen(true)}
                      title="删除当前书籍 (Delete Book)"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, padding: 0,
                        background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", borderRadius: 4,
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
                        <line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                    </button>
                  </div>

                  {/* Consolidation recommendation */}
                  {consolidationRecommend && (
                    <div style={{
                      margin: "8px 10px", padding: "10px 12px", background: "rgba(249, 115, 22, 0.04)",
                      border: "1px solid rgba(249, 115, 22, 0.25)", borderRadius: "8px", fontSize: "11px",
                      fontFamily: "var(--font-serif)", boxShadow: "0 2px 8px rgba(249, 115, 22, 0.05)", flexShrink: 0,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "#e07a34", marginBottom: 4 }}>
                        <span style={{ fontSize: 13 }}>🗜️</span>
                        <span>建议进行大纲摘要压缩</span>
                      </div>
                      <div style={{ color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 8 }}>
                        检测到完结卷 <strong>{recommendVolumeName}</strong>，建议运行压缩归档以优化大语言模型上下文，防止远期伏笔记忆衰退。
                      </div>
                      <button
                        onClick={() => setIsConsolidationModalOpen(true)}
                        style={{
                          width: "100%", padding: "5px 0", background: "rgba(249, 115, 22, 0.08)",
                          border: "1px solid rgba(249, 115, 22, 0.35)", borderRadius: "6px", color: "#ff903f",
                          fontWeight: 600, cursor: "pointer", textAlign: "center", fontSize: "11px", transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(249, 115, 22, 0.16)";
                          e.currentTarget.style.borderColor = "#f97316";
                          e.currentTarget.style.color = "#ffaa64";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(249, 115, 22, 0.08)";
                          e.currentTarget.style.borderColor = "rgba(249, 115, 22, 0.35)";
                          e.currentTarget.style.color = "#ff903f";
                        }}
                      >
                        🗜️ 一键压缩归档
                      </button>
                    </div>
                  )}

                  {/* Fanfiction Indicator */}
                  {isFanfic && (
                    <div style={{
                      margin: "0 10px 8px 10px", padding: "8px 12px", background: "var(--bg-panel)",
                      border: "1px solid var(--border)", borderRadius: "8px", fontSize: "11px", display: "flex",
                      alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
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
                        onClick={() => setIsFanficRefreshModalOpen(true)}
                        style={{
                          padding: "2px 6px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)",
                          borderRadius: "4px", fontSize: "10px", outline: "none", cursor: "pointer", fontWeight: 500,
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                      >
                        🔁 刷新设定
                      </button>
                    </div>
                  )}

                  <div style={{ flex: 1, overflowY: "auto" }}>
                    <FileExplorer
                      cwd={activeCwd}
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

      {/* Gem AI co-writers panel */}
      {activeCwd && (
        <div style={{ flexShrink: 0, paddingBottom: 6 }}>
          <div
            onClick={() => setGemsExpanded(!gemsExpanded)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px 4px",
              color: "var(--text-muted)", cursor: "pointer", fontSize: 11, fontWeight: 600,
              letterSpacing: "0.05em", textTransform: "uppercase",
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
                background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer",
                padding: "2px 6px", borderRadius: 4, fontSize: 10, display: "flex", alignItems: "center", gap: 2,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
            >
              + Create
            </button>
          </div>

          {gemsExpanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 6px", maxHeight: 240, overflowY: "auto" }}>
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
                        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px",
                        borderRadius: 6, background: isSelected ? "var(--bg-selected)" : "transparent",
                        cursor: "pointer", fontSize: 12, transition: "all 0.12s",
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
                        <Emoji char={gem.avatar || "🔮"} style={{ fontSize: 14, flexShrink: 0 }} />
                        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                          <span style={{
                            color: isSelected ? "var(--accent)" : "var(--text)",
                            fontWeight: isSelected ? 600 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {gem.name}
                          </span>
                          {gem.description && (
                            <span style={{ fontSize: 10, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {gem.description}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {(!isDefaultGem || !disableDefaultAgentEditDelete) && (
                        <div className="gem-actions" style={{ display: "flex", gap: 4, flexShrink: 0, opacity: 0, transition: "opacity 0.15s" }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingGemId(gem.id); setIsGemModalOpen(true); }}
                            title="编辑"
                            style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 2 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
                          >
                            ✎
                          </button>
                          <button
                            onClick={(e) => handleDeleteGem(e, gem.id)}
                            title="删除"
                            style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 2 }}
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

      {/* Session list section */}
      {activeCwd && (
        <div style={{
          display: "flex", flexDirection: "column", flexShrink: 0, borderTop: "1px solid var(--border)",
          height: sessionsExpanded ? "auto" : "35px", boxSizing: "border-box",
          justifyContent: sessionsExpanded ? "flex-start" : "center",
        }}>
          <div
            onClick={() => setSessionsExpanded(!sessionsExpanded)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: sessionsExpanded ? "8px 10px 4px" : "0 10px",
              color: "var(--text-muted)", cursor: "pointer", fontSize: 11, fontWeight: 600,
              letterSpacing: "0.05em", textTransform: "uppercase",
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
              {loading && <div style={{ padding: "12px 14px", color: "var(--text-muted)", fontSize: 11 }}>Loading...</div>}
              {error && <div style={{ padding: "12px 14px", color: "#f87171", fontSize: 11 }}>{error}</div>}
              {!loading && !error && filteredSessions.length === 0 && (
                <div style={{ padding: "12px 14px", color: "var(--text-muted)", fontSize: 11 }}>无历史协同会话</div>
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

      {/* Styled inline elements */}
      <style>{`
        .gem-sidebar-item:hover .gem-actions {
          opacity: 1 !important;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 1; }
        }
      `}</style>

      {/* Modals & Dialogs Components */}
      <GemEditorModal
        isOpen={isGemModalOpen}
        onClose={() => setIsGemModalOpen(false)}
        gemId={editingGemId}
        onSave={() => loadGems()}
        modelList={modelList}
        defaultModel={defaultModel}
      />

      <BookDeleteModal
        isOpen={isDeleteBookModalOpen}
        onClose={() => setIsDeleteBookModalOpen(false)}
        cwd={activeCwd || ""}
        bookId={activeBookId || ""}
        onDeleted={() => {
          const remaining = availableBooks.filter((b) => b !== activeBookId);
          const nextBook = remaining.length > 0 ? remaining[0] : null;
          checkWorkspaceStatus(activeCwd || "", nextBook || undefined);
          setExplorerKey((k) => k + 1);
        }}
      />

      <BookCreateModal
        isOpen={isBookModalOpen}
        onClose={() => setIsBookModalOpen(false)}
        cwd={activeCwd || ""}
        availableBooks={availableBooks}
        dynamicGenres={dynamicGenres}
        onCreated={(newBookId) => {
          checkWorkspaceStatus(activeCwd || "", newBookId);
          setExplorerKey((k) => k + 1);
        }}
      />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        cwd={activeCwd || ""}
        activeBookId={activeBookId}
        availableBooks={availableBooks}
        onImportSuccess={async (targetBookId) => {
          await checkWorkspaceStatus(activeCwd || "", targetBookId || activeBookId || undefined);
          setExplorerKey((k) => k + 1);
          window.dispatchEvent(new CustomEvent("refresh-explorer"));
        }}
      />

      <FanficRefreshModal
        isOpen={isFanficRefreshModalOpen}
        onClose={() => setIsFanficRefreshModalOpen(false)}
        cwd={activeCwd || ""}
        bookId={activeBookId || ""}
        onRefreshSuccess={() => {
          setExplorerKey((k) => k + 1);
          window.dispatchEvent(new CustomEvent("refresh-explorer"));
        }}
      />

      <ConsolidationModal
        isOpen={isConsolidationModalOpen}
        onClose={() => setIsConsolidationModalOpen(false)}
        cwd={activeCwd || ""}
        bookId={activeBookId || ""}
        onConsolidateSuccess={async () => {
          await checkWorkspaceStatus(activeCwd || "");
          setExplorerKey((k) => k + 1);
          window.dispatchEvent(new CustomEvent("refresh-explorer"));
        }}
      />

      <RadarModal
        isOpen={isRadarModalOpen}
        onClose={() => setIsRadarModalOpen(false)}
        cwd={activeCwd || ""}
      />

      <ShortRunModal
        isOpen={isShortRunModalOpen}
        onClose={() => setIsShortRunModalOpen(false)}
        cwd={activeCwd || ""}
        onCompleted={async () => {
          await checkWorkspaceStatus(activeCwd || "");
          setExplorerKey((k) => k + 1);
        }}
      />

      {/* Chapter Write Progress Modal */}
      {isWriteLoading && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(10, 10, 12, 0.65)",
          backdropFilter: "blur(8px)",
        }}>
          <div style={{
            background: "var(--bg-panel)",
            border: "1px solid rgba(139, 92, 246, 0.2)",
            borderRadius: "16px",
            width: "min(600px, 90vw)",
            padding: "32px 28px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4), 0 0 20px rgba(139, 92, 246, 0.05)",
            fontFamily: "var(--font-serif)",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}>
            {!writeError ? (
              <div style={{ position: "relative", width: "56px", height: "56px", margin: "0 auto 20px" }}>
                <div style={{
                  position: "absolute",
                  inset: -4,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, transparent 70%)",
                  animation: "pulse 2s infinite ease-in-out"
                }} />
                <div style={{
                  width: "100%",
                  height: "100%",
                  border: "3px solid rgba(139, 92, 246, 0.1)",
                  borderTopColor: "var(--accent)",
                  borderRadius: "50%",
                  animation: "spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite",
                  boxShadow: "0 0 15px rgba(139, 92, 246, 0.25)"
                }} />
              </div>
            ) : (
              <div style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.1)",
                border: "2px solid rgba(239, 68, 68, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "24px",
                color: "#ef4444",
                margin: "0 auto 20px",
                boxShadow: "0 0 15px rgba(239, 68, 68, 0.15)"
              }}>
                ⚠️
              </div>
            )}
            <div style={{ fontWeight: 600, color: writeError ? "#ef4444" : "var(--text)", marginBottom: 8, fontSize: "14px" }}>
              {writeError 
                ? (writeProgressText.includes("蓝图") ? "规划首章蓝图失败" : "智能写作首章失败") 
                : (writeProgressText.includes("蓝图") ? "正在规划首章蓝图..." : "正在进行智能首章写作...")
              }
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "11px", lineHeight: 1.6 }}>
              {writeError ? `错误详情: ${writeError}` : writeProgressText}
            </div>

            {/* Terminal Live Output Console */}
            <div style={{ display: "flex", flexDirection: "column", marginTop: "20px" }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--border)",
                borderBottom: "none",
                padding: "8px 12px",
                borderTopLeftRadius: "8px",
                borderTopRightRadius: "8px",
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                color: "var(--text-muted)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{
                    width: "8px", height: "8px", borderRadius: "50%",
                    background: writeError ? "#ef4444" : "#10b981",
                    boxShadow: writeError ? "0 0 8px #ef4444" : "0 0 8px #10b981",
                  }} />
                  <span style={{ fontWeight: 600, letterSpacing: "0.05em" }}>STDOUT / STDERR LOGS</span>
                </div>
                <div style={{ opacity: 0.6 }}>LOGSTREAM</div>
              </div>
              <div 
                ref={consoleRef}
                style={{
                  background: "#09090b",
                  border: "1px solid var(--border)",
                  borderBottomLeftRadius: "8px",
                  borderBottomRightRadius: "8px",
                  padding: "14px 16px",
                  height: "220px",
                  overflowY: "auto",
                  textAlign: "left",
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: "11px",
                  lineHeight: "1.6",
                  color: "#e4e4e7",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {logs.length === 0 ? (
                  <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>正在初始化并启动创作引擎，请稍候...</span>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} style={{ marginBottom: 2, borderBottom: "1px dashed rgba(255,255,255,0.02)", paddingBottom: 2 }}>
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>

            {writeError && (
              <button
                onClick={() => {
                  setIsWriteLoading(false);
                  setWriteError(null);
                }}
                style={{
                  marginTop: 20,
                  padding: "8px 24px",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: "6px",
                  color: "white",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(139, 92, 246, 0.2)",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.filter = "brightness(1.1)";
                  e.currentTarget.style.boxShadow = "0 6px 16px rgba(139, 92, 246, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = "none";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(139, 92, 246, 0.2)";
                }}
              >
                关闭并返回
              </button>
            )}
          </div>
        </div>
      )}

      {/* Writing & Blueprint Planning feedback report modal */}
      {isWriteReportOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 999,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            width: "min(680px, 92vw)",
            maxHeight: "85vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            fontFamily: "var(--font-serif)",
            overflow: "hidden",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 18px", borderBottom: "1px solid var(--border)",
              background: "var(--bg-panel)", flexShrink: 0
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                {writeReportTitle}
              </span>
              <button
                onClick={() => {
                  setIsWriteReportOpen(false);
                  setLastWriteResult(null);
                  setWriteError(null);
                }}
                style={{
                  padding: "4px 12px", fontSize: 11, borderRadius: 4,
                  border: "1px solid var(--border)", background: "var(--bg-hover)",
                  color: "var(--text-muted)", cursor: "pointer", fontWeight: 600,
                }}
              >
                ✕ 关闭
              </button>
            </div>
            <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto", fontSize: "12px", color: "var(--text)" }}>
              {writeError ? (
                <div style={{
                  background: "rgba(239, 68, 68, 0.04)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  borderRadius: 8, padding: "14px",
                  color: "#ef4444", fontSize: "12px", lineHeight: 1.6,
                }}>
                  ⚠️ 出错啦：{writeError}
                </div>
              ) : lastWriteResult ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Stats Grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{
                      padding: "10px 14px", background: "rgba(139,92,246,0.08)",
                      border: "1px solid rgba(139,92,246,0.15)", borderRadius: 8,
                      display: "flex", flexDirection: "column", gap: 2,
                    }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>生成字数</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#a78bfa" }}>{lastWriteResult.wordCount} 字</div>
                    </div>
                    <div style={{
                      padding: "10px 14px", background: "rgba(52,211,153,0.08)",
                      border: "1px solid rgba(52,211,153,0.15)", borderRadius: 8,
                      display: "flex", flexDirection: "column", gap: 2,
                    }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>章节状态</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#34d399" }}>{lastWriteResult.status || "complete"}</div>
                    </div>
                  </div>

                  {/* Audit Result */}
                  {lastWriteResult.auditResult && (() => {
                    const isPassed = lastWriteResult.auditResult.passed ?? false;
                    const issues = lastWriteResult.auditResult.issues ?? [];
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          <Emoji char="🔍" style={{ marginRight: 6 }} />离线审稿与设定审计结果
                        </div>
                        <div style={{
                          padding: "10px 14px", borderRadius: 8,
                          background: isPassed ? "rgba(74,222,128,0.06)" : "rgba(251,191,36,0.06)",
                          border: `1px solid ${isPassed ? "rgba(74,222,128,0.15)" : "rgba(251,191,36,0.15)"}`,
                          borderLeft: `3px solid ${isPassed ? "#4ade80" : "#fbbf24"}`,
                          fontSize: 12, fontWeight: 600,
                          color: isPassed ? "#4ade80" : "#fbbf24",
                        }}>
                          {isPassed ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <StatusIcon type="check" size={12} />
                              <span>审计通过 — 无明显 logic 矛盾或角色人设崩塌风险</span>
                            </span>
                          ) : (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <StatusIcon type="warning" size={12} />
                              <span>审计未完全通过 — 检测到一些 logic 或人设风险：</span>
                            </span>
                          )}
                        </div>

                        {issues.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "350px", overflowY: "auto", paddingRight: 4 }}>
                            {issues.map((issue: { severity?: string; category?: string; description?: string; suggestion?: string }, i: number) => {
                              const sev = String(issue.severity || "info").toLowerCase();
                              const cfg =
                                sev === "error" || sev === "critical"
                                  ? { color: "#f87171", bg: "rgba(248,113,113,0.06)", border: "#f87171", iconType: "error" as const, label: "严重" }
                                  : sev === "warning"
                                  ? { color: "#fbbf24", bg: "rgba(251,191,36,0.06)", border: "#fbbf24", iconType: "warning" as const, label: "警告" }
                                  : { color: "#60a5fa", bg: "rgba(96,165,250,0.06)", border: "#60a5fa", iconType: "info" as const, label: "提示" };
                              return (
                                <div key={i} style={{
                                  padding: "12px 14px", background: cfg.bg,
                                  border: `1px solid ${cfg.border}22`, borderLeft: `3px solid ${cfg.border}`,
                                  borderRadius: 8, display: "flex", flexDirection: "column", gap: 6,
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <StatusIcon type={cfg.iconType} size={13} />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{cfg.label}</span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", background: "var(--bg-hover)", padding: "1px 8px", borderRadius: 4 }}>
                                      {issue.category || "未分类"}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 13, lineHeight: 1.75, color: "var(--text)", marginTop: 2 }}>
                                    {issue.description}
                                  </div>
                                  <div style={{ fontSize: 13, lineHeight: 1.75, color: "var(--text-muted)", fontStyle: "italic", marginTop: 1 }}>
                                    <Emoji char="💡" style={{ marginRight: 4 }} />建议: {issue.suggestion}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : writeReportTitle === "首章蓝图规划完成" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "center", padding: "10px 0" }}>
                  <Emoji char="📖" style={{ fontSize: "36px", display: "block", margin: "0 auto" }} />
                  <h4 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text)", margin: 0 }}>首章写作蓝图规划成功！</h4>
                  <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.75, margin: 0 }}>
                    已成功规划首章大纲、正文起草焦点与意图设定栈。<br />
                    大纲规划文件已保存在您的系统目录中。
                  </p>
                  <div style={{
                    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "8px",
                    padding: "10px 12px", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.6, textAlign: "left",
                  }}>
                    <strong>规划文件路径：</strong>
                    <div style={{ wordBreak: "break-all", fontFamily: "var(--font-mono)", fontSize: 11, marginTop: 4, color: "var(--accent)" }}>
                      books/{activeBookId}/story/runtime/chapter-0001.plan.md
                    </div>
                  </div>
                </div>
              ) : (
                <div className="markdown-body" style={{ fontSize: "13px", lineHeight: "1.75" }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{writeReportContent}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
