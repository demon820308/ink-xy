"use client";

import { useEffect, useState, useRef } from "react";
import { encodeFilePathForApi, getFileName, getRelativeFilePath } from "@/lib/file-paths";
import { Emoji } from "../Emoji";

const PPTX_EXTS = new Set(["pptx", "ppt"]);

export function isPptxPath(filePath: string): boolean {
  const base = getFileName(filePath);
  const ext = base.toLowerCase().split(".").pop() ?? "";
  return PPTX_EXTS.has(ext);
}

function getFileDisplayPath(filePath: string, cwd?: string): string {
  const relative = getRelativeFilePath(filePath, cwd);
  const normalized = relative.replace(/\\/g, "/");
  const match = normalized.match(/^books\/[^/]+\/chapters\/(.+)$/);
  if (match) {
    return match[1];
  }
  return relative;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isLocalOrPrivateHost(hostname: string): boolean {
  if (!hostname) return true;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
    return true;
  }
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Pattern);
  if (match) {
    const [, p1, p2] = match.map(Number);
    if (p1 === 10) return true;
    if (p1 === 172 && p2 >= 16 && p2 <= 31) return true;
    if (p1 === 192 && p2 === 168) return true;
    if (p1 === 169 && p2 === 254) return true;
    if (p1 === 127) return true;
  }
  if (hostname.startsWith("[fe8") || hostname.startsWith("[fc") || hostname.startsWith("[fd") || hostname.startsWith("fe8") || hostname.startsWith("fc") || hostname.startsWith("fd")) {
    return true;
  }
  return false;
}

interface PptxViewerInstance {
  processor?: {
    getSlideDimensions?(): { cx: number; cy: number };
    presentation?: {
      slideSize?: { cx: number; cy: number };
    };
  };
  renderSlide(slideIndex: number, canvas: HTMLCanvasElement | null, options?: Record<string, unknown>): Promise<unknown>;
  getSlideCount(): number;
  getCurrentSlideIndex(): number;
  destroy(): void;
}

interface LocalPptxViewerProps {
  filePath: string;
  src: string;
  formatSizeStr: string | null;
  ext: string;
}

function LocalPptxViewer({ src }: LocalPptxViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  const [viewer, setViewer] = useState<PptxViewerInstance | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [totalSlides, setTotalSlides] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDimensions, setModalDimensions] = useState<{ width: number; height: number } | null>(null);

  // 1. Observe container dimensions dynamically
  useEffect(() => {
    if (!containerRef.current) return;

    // Set initial size
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDimensions({ width: rect.width, height: rect.height });
    }

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
      }
    });

    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
    };
  }, []);

  // 1b. Observe modal container dimensions dynamically when open
  useEffect(() => {
    if (!isModalOpen || !modalContainerRef.current) return;

    // Set initial size
    const rect = modalContainerRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setModalDimensions({ width: rect.width, height: rect.height });
    }

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setModalDimensions({ width, height });
      }
    });

    observer.observe(modalContainerRef.current);
    return () => {
      observer.disconnect();
    };
  }, [isModalOpen]);

  // 2. Load the PPTX presentation (only on src change)
  useEffect(() => {
    let active = true;
    let localViewer: PptxViewerInstance | null = null;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        // Fetch ArrayBuffer of the PPTX file
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error(`Failed to load file: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();

        if (!active) return;

        // Dynamically import pptxviewjs client-side to prevent SSR issues
        const { PPTXViewer } = await import("pptxviewjs");
        
        if (!active) return;

        const rawViewer = new PPTXViewer({
          canvas: canvasRef.current,
          slideSizeMode: "fit",
          autoChartRerenderDelayMs: 200,
        });

        localViewer = rawViewer as unknown as PptxViewerInstance;
        await rawViewer.loadFile(new Uint8Array(arrayBuffer));

        if (!active) return;

        setTotalSlides(localViewer.getSlideCount());
        setCurrentSlide(localViewer.getCurrentSlideIndex());
        
        let ratio = 16 / 9;
        const processor = localViewer.processor;
        if (processor) {
          if (typeof processor.getSlideDimensions === "function") {
            const slideSize = processor.getSlideDimensions();
            if (slideSize && slideSize.cx && slideSize.cy) {
              ratio = slideSize.cx / slideSize.cy;
            }
          } else if (processor.presentation?.slideSize) {
            const slideSize = processor.presentation.slideSize;
            if (slideSize && slideSize.cx && slideSize.cy) {
              ratio = slideSize.cx / slideSize.cy;
            }
          }
        }
        setAspectRatio(ratio);

        setViewer(localViewer);
        setLoading(false);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("PPTX render error:", err);
        if (active) {
          setError(errMsg || "Failed to render PowerPoint presentation");
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      active = false;
      if (localViewer) {
        try {
          localViewer.destroy();
        } catch {
          // ignore
        }
      }
    };
  }, [src]);

  // 3. Calculate exact canvas dimensions based on container sizes and slide aspect ratio
  const currentRatio = aspectRatio || (16 / 9);
  let canvasWidth = 0;
  let canvasHeight = 0;

  if (dimensions) {
    // Keep 16px padding on all sides (total 32px subtracted)
    const maxW = Math.max(10, dimensions.width - 32);
    const maxH = Math.max(10, dimensions.height - 32);

    if (maxW / maxH > currentRatio) {
      canvasHeight = maxH;
      canvasWidth = maxH * currentRatio;
    } else {
      canvasWidth = maxW;
      canvasHeight = maxW / currentRatio;
    }
  }

  // Calculate exact canvas dimensions for the modal
  let modalCanvasWidth = 0;
  let modalCanvasHeight = 0;

  if (isModalOpen && modalDimensions) {
    // Keep 24px padding on each side (total 48px subtracted) and 80px for header
    const maxW = Math.max(10, modalDimensions.width - 48);
    const maxH = Math.max(10, modalDimensions.height - 80);

    if (maxW / maxH > currentRatio) {
      modalCanvasHeight = maxH;
      modalCanvasWidth = maxH * currentRatio;
    } else {
      modalCanvasWidth = maxW;
      modalCanvasHeight = maxW / currentRatio;
    }
  }

  // 4. Render the current slide on the main canvas when viewer, slide index, or canvas dimensions change
  useEffect(() => {
    const currentViewer = viewer;
    if (!currentViewer || !canvasRef.current || canvasWidth === 0 || canvasHeight === 0 || isModalOpen) return;

    let active = true;
    async function draw() {
      if (!currentViewer) return;
      try {
        await currentViewer.renderSlide(currentSlide, canvasRef.current, { quality: "high" });
      } catch (e) {
        if (active) {
          console.error("Render slide error:", e);
        }
      }
    }
    draw();

    return () => {
      active = false;
    };
  }, [viewer, currentSlide, canvasWidth, canvasHeight, isModalOpen]);

  // 4b. Render the current slide in the modal when viewer, currentSlide, dimensions, or canvas size changes
  useEffect(() => {
    const currentViewer = viewer;
    if (!isModalOpen || !currentViewer || !modalCanvasRef.current || modalCanvasWidth === 0 || modalCanvasHeight === 0) return;

    let active = true;
    async function draw() {
      if (!currentViewer) return;
      try {
        await currentViewer.renderSlide(currentSlide, modalCanvasRef.current, { quality: "high" });
      } catch (e) {
        if (active) {
          console.error("Render modal slide error:", e);
        }
      }
    }
    draw();

    return () => {
      active = false;
    };
  }, [isModalOpen, viewer, currentSlide, modalCanvasWidth, modalCanvasHeight]);

  const handleNext = () => {
    if (viewer && currentSlide < totalSlides - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const handlePrev = () => {
    if (viewer && currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
      {/* PPT navigation toolbar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 16px",
        background: "var(--bg)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
            {totalSlides > 0 ? `Slide ${currentSlide + 1} of ${totalSlides}` : "Loading slides..."}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={handlePrev}
            disabled={loading || currentSlide === 0}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--bg-hover)",
              color: "var(--text)",
              cursor: (loading || currentSlide === 0) ? "default" : "pointer",
              opacity: (loading || currentSlide === 0) ? 0.5 : 1,
            }}
          >
            ◀ Prev
          </button>
          <button
            onClick={handleNext}
            disabled={loading || currentSlide === totalSlides - 1}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--bg-hover)",
              color: "var(--text)",
              cursor: (loading || currentSlide === totalSlides - 1) ? "default" : "pointer",
              opacity: (loading || currentSlide === totalSlides - 1) ? 0.5 : 1,
            }}
          >
            Next ▶
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={loading || totalSlides === 0}
            title="Open in fullscreen zoom"
            style={{
              padding: "4px 10px",
              fontSize: 11,
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--bg-hover)",
              color: "var(--text)",
              cursor: (loading || totalSlides === 0) ? "default" : "pointer",
              opacity: (loading || totalSlides === 0) ? 0.5 : 1,
            }}
          >
            <Emoji char="🔍" /> Zoom
          </button>
          <a
            href={src}
            download
            title="Download original file"
            style={{
              padding: "4px 10px",
              fontSize: 11,
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--accent)",
              color: "white",
              textDecoration: "none",
              fontWeight: 500,
              marginLeft: 6
            }}
          >
            <Emoji char="⬇️" /> Download
          </a>
        </div>
      </div>

      {/* Main rendering area */}
      <div 
        ref={containerRef}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-panel)",
          position: "relative",
          overflow: "hidden"
        }}
      >
        {loading && (
          <div style={{
            position: "absolute",
            zIndex: 10,
            background: "rgba(0,0,0,0.05)",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
            fontSize: 13
          }}>
            Rendering slide...
          </div>
        )}
        
        {error ? (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16
          }}>
            <div style={{
              padding: 24,
              background: "var(--bg-panel)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              textAlign: "center",
              maxWidth: 400
            }}>
              <Emoji char="⚠️" style={{ fontSize: 36, marginBottom: 12, display: "block" }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f87171", marginBottom: 8 }}>
                Local Preview Failed
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                {error}
              </div>
              <a
                href={src}
                download
                style={{
                  padding: "6px 16px",
                  background: "var(--accent)",
                  color: "white",
                  borderRadius: 4,
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 500,
                  display: "inline-block"
                }}
              >
                <Emoji char="⬇️" /> Download File
              </a>
            </div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            style={{
              width: `${Math.round(canvasWidth)}px`,
              height: `${Math.round(canvasHeight)}px`,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              background: "white",
              display: "block",
              visibility: loading && totalSlides === 0 ? "hidden" : "visible"
            }}
          />
        )}
      </div>

      {/* Modal Zoom Overlay */}
      {isModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "rgba(10, 10, 10, 0.95)",
          backdropFilter: "blur(8px)",
          display: "flex",
          flexDirection: "column",
          padding: "20px 24px",
          color: "white"
        }}>
          {/* Modal Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            flexShrink: 0
          }}>
            <span style={{ fontSize: 13, color: "#ccc", fontWeight: 500 }}>
              {totalSlides > 0 ? `Slide ${currentSlide + 1} of ${totalSlides}` : ""}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={handlePrev}
                disabled={currentSlide === 0}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "1px solid #444",
                  background: "#222",
                  color: "white",
                  cursor: currentSlide === 0 ? "default" : "pointer",
                  opacity: currentSlide === 0 ? 0.5 : 1,
                }}
              >
                ◀ Prev
              </button>
              <button
                onClick={handleNext}
                disabled={currentSlide === totalSlides - 1}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "1px solid #444",
                  background: "#222",
                  color: "white",
                  cursor: currentSlide === totalSlides - 1 ? "default" : "pointer",
                  opacity: currentSlide === totalSlides - 1 ? 0.5 : 1,
                }}
              >
                Next ▶
              </button>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  padding: "6px 16px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "none",
                  background: "#ef4444",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 600,
                  marginLeft: 12
                }}
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Modal Canvas Container */}
          <div 
            ref={modalContainerRef}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              position: "relative"
            }}
          >
            {modalCanvasWidth > 0 && modalCanvasHeight > 0 && (
              <canvas
                ref={modalCanvasRef}
                style={{
                  width: `${Math.round(modalCanvasWidth)}px`,
                  height: `${Math.round(modalCanvasHeight)}px`,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                  background: "white",
                  display: "block"
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface PptxViewerProps {
  filePath: string;
  cwd?: string;
}

export function PptxViewer({ filePath, cwd }: PptxViewerProps) {
  const [watching, setWatching] = useState(false);
  const [bust, setBust] = useState(0);
  const [size, setSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const ext = getFileName(filePath).toLowerCase().split(".").pop() ?? "";

  useEffect(() => {
    setBust(0);
    setSize(null);
    setError(null);
    setWatching(false);

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const encoded = encodeFilePathForApi(filePath);
    const es = new EventSource(`/api/files/${encoded}?type=watch`);
    esRef.current = es;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    es.addEventListener("change", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { size?: number };
        if (typeof d.size === "number") setSize(d.size);
      } catch { /* ignore */ }
      
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        setBust((b) => b + 1);
      }, 1500); // 1.5s debounce for PPTX presentations
    });
    es.addEventListener("error", () => setWatching(false));
    es.onerror = () => setWatching(false);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      es.close();
      esRef.current = null;
    };
  }, [filePath]);

  const encoded = encodeFilePathForApi(filePath);
  const src = `/api/files/${encoded}?type=read${bust ? `&v=${bust}` : ""}`;

  const formatSizeStr = size != null ? formatSize(size) : null;
  const isLocal = typeof window !== "undefined" && isLocalOrPrivateHost(window.location.hostname);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "4px 16px",
          borderBottom: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-dim)",
          background: "var(--bg)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)" }} title={filePath}>
          {getFileDisplayPath(filePath, cwd)}
        </span>
        <span style={{ marginLeft: "auto" }}>{ext.toUpperCase()}</span>
        {formatSizeStr && <span>{formatSizeStr}</span>}
        <span
          title={watching ? "Live sync active" : "Not watching"}
          style={{ display: "flex", alignItems: "center", gap: 4, color: watching ? "#4ade80" : "var(--text-dim)" }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: watching ? "#4ade80" : "var(--border)",
              display: "inline-block",
              boxShadow: watching ? "0 0 4px #4ade80" : "none",
            }}
          />
          {watching ? "live" : "static"}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--bg-panel)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {error ? (
          <div style={{ color: "#f87171", fontSize: 13, padding: 16 }}>{error}</div>
        ) : isLocal ? (
          <LocalPptxViewer filePath={filePath} src={src} formatSizeStr={formatSizeStr} ext={ext} />
        ) : (
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(window.location.origin + src)}`}
            style={{ width: "100%", height: "100%", border: "none" }}
            title="PPT Preview"
          />
        )}
      </div>
    </div>
  );
}
