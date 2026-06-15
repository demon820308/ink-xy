import React, { useState, useMemo } from "react";

interface ArcRow {
  character: string;
  chapter: number;
  emotion: string;
  trigger: string;
  intensity: number;
  direction: string;
}

interface EmotionalArcVisualizerProps {
  initialContent: string;
}

export const EmotionalArcVisualizer: React.FC<EmotionalArcVisualizerProps> = ({ initialContent }) => {
  const [selectedChar, setSelectedChar] = useState<string>("all");
  const [hoveredPoint, setHoveredPoint] = useState<{
    char: string;
    chapter: number;
    emotion: string;
    trigger: string;
    intensity: number;
    x: number;
    y: number;
  } | null>(null);

  // Parse Markdown Table
  const data: ArcRow[] = useMemo(() => {
    const lines = initialContent.split("\n");
    const parsed: ArcRow[] = [];
    let isHeader = true;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
      
      // Skip separator
      if (trimmed.includes("---")) continue;

      const cells = trimmed.split("|").slice(1, -1).map(c => c.trim());
      if (cells.length < 5) continue;

      // Skip header row
      const isHeaderRow = cells.some(cell => 
        cell.includes("角色") || cell.includes("Character") ||
        cell.includes("章节") || cell.includes("Chapter")
      );
      if (isHeaderRow) continue;

      const character = cells[0] || "";
      const chapter = parseInt(cells[1] || "", 10) || 0;
      const emotion = cells[2] || "";
      const trigger = cells[3] || "";
      const intensity = parseFloat(cells[4] || "") || 5;
      const direction = cells[5] || "";

      if (character && chapter > 0) {
        parsed.push({ character, chapter, emotion, trigger, intensity, direction });
      }
    }

    // Sort by chapter ascending
    return parsed.sort((a, b) => a.chapter - b.chapter);
  }, [initialContent]);

  // Extract unique characters list
  const characters = useMemo(() => {
    const chars = new Set<string>();
    data.forEach(item => chars.add(item.character));
    return Array.from(chars);
  }, [data]);

  // Extract min and max chapters
  const { minChapter, maxChapter } = useMemo(() => {
    if (data.length === 0) return { minChapter: 1, maxChapter: 10 };
    const chapters = data.map(d => d.chapter);
    return {
      minChapter: Math.min(...chapters),
      maxChapter: Math.max(...chapters)
    };
  }, [data]);

  // Color palette for characters
  const charColors = useMemo(() => {
    const colors = [
      "#eb5e55", // Red
      "#3a86c8", // Blue
      "#10b981", // Green
      "#f59e0b", // Yellow
      "#8b5cf6", // Purple
      "#ec4899", // Pink
      "#06b6d4", // Cyan
      "#f97316"  // Orange
    ];
    const map: Record<string, string> = {};
    characters.forEach((char, idx) => {
      map[char] = colors[idx % colors.length]!;
    });
    return map;
  }, [characters]);

  // Filtered Data
  const chartData = useMemo(() => {
    if (selectedChar === "all") return data;
    return data.filter(d => d.character === selectedChar);
  }, [data, selectedChar]);

  // Group points by character for drawing lines
  const characterLines = useMemo(() => {
    const grouped: Record<string, ArcRow[]> = {};
    data.forEach(item => {
      if (!grouped[item.character]) {
        grouped[item.character] = [];
      }
      grouped[item.character]!.push(item);
    });
    return grouped;
  }, [data]);

  // SVG Chart Dimensions
  const width = 600;
  const height = 300;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 45;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Render SVG Path Helper
  const getCoordinates = (chapter: number, intensity: number) => {
    // Map chapter to X
    const chapterRange = maxChapter - minChapter || 1;
    const x = paddingLeft + ((chapter - minChapter) / chapterRange) * chartWidth;

    // Map intensity (1-10) to Y
    const y = paddingTop + ((10 - intensity) / 9) * chartHeight;
    return { x, y };
  };

  // Render grids and ticks
  const gridLines = useMemo(() => {
    const ticks = [];
    const chapterRange = maxChapter - minChapter;
    const step = Math.max(1, Math.ceil(chapterRange / 10));

    for (let ch = minChapter; ch <= maxChapter; ch += step) {
      const { x } = getCoordinates(ch, 5);
      ticks.push(
        <g key={`x-grid-${ch}`} style={{ opacity: 0.15 }}>
          <line x1={x} y1={paddingTop} x2={x} y2={height - paddingBottom} stroke="var(--text)" strokeDasharray="3,3" />
          <text
            x={x}
            y={height - paddingBottom + 16}
            textAnchor="middle"
            fill="var(--text-muted)"
            style={{ fontSize: "10px", fontFamily: "var(--font-mono)" }}
          >
            Ch.{ch}
          </text>
        </g>
      );
    }
    return ticks;
  }, [minChapter, maxChapter]);

  const yTicks = useMemo(() => {
    const ticks = [];
    for (let i = 1; i <= 10; i += 2) {
      const { y } = getCoordinates(minChapter, i);
      ticks.push(
        <g key={`y-grid-${i}`} style={{ opacity: 0.15 }}>
          <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="var(--text)" strokeDasharray="3,3" />
          <text
            x={paddingLeft - 8}
            y={y + 4}
            textAnchor="end"
            fill="var(--text-muted)"
            style={{ fontSize: "10px", fontFamily: "var(--font-mono)" }}
          >
            {i}
          </text>
        </g>
      );
    }
    return ticks;
  }, [minChapter]);

  return (
    <div style={{
      maxWidth: "750px",
      margin: "0 auto",
      padding: "20px",
      background: "var(--bg-panel)",
      borderRadius: "12px",
      border: "1px solid var(--border)",
      color: "var(--text)",
      fontFamily: "var(--font-sans)"
    }}>
      <h3 style={{ margin: "0 0 16px 0", fontSize: "15px", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
        <span>📈 角色情感状态与心理弧线图</span>
      </h3>

      {data.length === 0 ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-dim)", fontSize: "12px" }}>
          💡 暂无情感弧度数据。写手引擎运行「同步设定」后，会根据章节情节在此处自动累计生成数据。
        </div>
      ) : (
        <>
          {/* Character Visibility Filter Toggles */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
            <button
              onClick={() => setSelectedChar("all")}
              style={{
                padding: "4px 10px",
                borderRadius: "12px",
                fontSize: "11px",
                border: "1px solid var(--border)",
                cursor: "pointer",
                background: selectedChar === "all" ? "var(--accent)" : "var(--bg)",
                color: selectedChar === "all" ? "#fff" : "var(--text)",
                fontWeight: 500
              }}
            >
              全部角色
            </button>
            {characters.map(char => (
              <button
                key={char}
                onClick={() => setSelectedChar(char)}
                style={{
                  padding: "4px 10px",
                  borderRadius: "12px",
                  fontSize: "11px",
                  border: `1px solid ${selectedChar === char ? charColors[char] : "var(--border)"}`,
                  cursor: "pointer",
                  background: selectedChar === char ? charColors[char] : "var(--bg)",
                  color: selectedChar === char ? "#fff" : "var(--text)",
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <span style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: selectedChar === char ? "#fff" : charColors[char]
                }} />
                {char}
              </button>
            ))}
          </div>

          {/* SVG Trend Chart */}
          <div style={{ position: "relative", marginBottom: "20px", background: "var(--bg)", borderRadius: "8px", border: "1px solid var(--border)", padding: "12px" }}>
            <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }}>
              {/* Grids */}
              {gridLines}
              {yTicks}

              {/* Draw Axis Lines */}
              <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={height - paddingBottom} stroke="var(--border)" strokeWidth={1} />
              <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="var(--border)" strokeWidth={1} />

              {/* Draw Paths per Character */}
              {Object.entries(characterLines).map(([char, points]) => {
                if (selectedChar !== "all" && selectedChar !== char) return null;
                const color = charColors[char] || "var(--accent)";

                // Generate path points
                const pathData = points
                  .map((p, idx) => {
                    const { x, y } = getCoordinates(p.chapter, p.intensity);
                    return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
                  })
                  .join(" ");

                return (
                  <g key={`path-${char}`}>
                    <path
                      d={pathData}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ opacity: 0.8 }}
                    />
                    
                    {/* Render dots */}
                    {points.map((p) => {
                      const { x, y } = getCoordinates(p.chapter, p.intensity);
                      const isHovered = hoveredPoint && hoveredPoint.char === char && hoveredPoint.chapter === p.chapter;

                      return (
                        <circle
                          key={`dot-${char}-${p.chapter}`}
                          cx={x}
                          cy={y}
                          r={isHovered ? 6 : 4}
                          fill={color}
                          stroke="var(--bg)"
                          strokeWidth={1.5}
                          style={{ cursor: "pointer", transition: "all 0.1s ease" }}
                          onMouseEnter={() => setHoveredPoint({
                            char,
                            chapter: p.chapter,
                            emotion: p.emotion,
                            trigger: p.trigger,
                            intensity: p.intensity,
                            x,
                            y
                          })}
                          onMouseLeave={() => setHoveredPoint(null)}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoveredPoint && (
              <div style={{
                position: "absolute",
                left: `${(hoveredPoint.x / width) * 100}%`,
                top: `${(hoveredPoint.y / height) * 100 - 45}%`,
                transform: "translate(-50%, -100%)",
                background: "var(--bg-panel)",
                border: `1px solid ${charColors[hoveredPoint.char]}`,
                borderRadius: "6px",
                padding: "8px 12px",
                fontSize: "11px",
                zIndex: 10,
                boxShadow: "0 4px 8px rgba(0,0,0,0.15)",
                pointerEvents: "none",
                display: "flex",
                flexDirection: "column",
                gap: "3px",
                minWidth: "160px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, borderBottom: "1px solid var(--border)", paddingBottom: "3px", marginBottom: "3px" }}>
                  <span style={{ color: charColors[hoveredPoint.char] }}>{hoveredPoint.char}</span>
                  <span>第 {hoveredPoint.chapter} 章</span>
                </div>
                <div>情绪状态：<strong>{hoveredPoint.emotion}</strong></div>
                <div>波动强度：<strong>{hoveredPoint.intensity} / 10</strong></div>
                <div style={{ color: "var(--text-muted)", marginTop: "2px", fontSize: "10px", lineHeight: 1.4 }}>
                  触发：{hoveredPoint.trigger || "（未录入）"}
                </div>
              </div>
            )}
          </div>

          {/* Detailed tabular overview */}
          <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "8px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", textAlign: "left" }}>
              <thead style={{ background: "var(--bg)", position: "sticky", top: 0, zIndex: 1, borderBottom: "1px solid var(--border)" }}>
                <tr>
                  <th style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>角色</th>
                  <th style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>章节</th>
                  <th style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>情绪状态</th>
                  <th style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>波动强度</th>
                  <th style={{ padding: "8px 12px" }}>触发事件</th>
                  <th style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>弧线走向</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row, idx) => (
                  <tr
                    key={`${row.character}-${row.chapter}-${idx}`}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: idx % 2 === 0 ? "transparent" : "rgba(var(--text-dim-rgb), 0.02)"
                    }}
                  >
                    <td style={{ padding: "8px 12px", fontWeight: 600, color: charColors[row.character], whiteSpace: "nowrap" }}>{row.character}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>第 {row.chapter} 章</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{row.emotion}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontWeight: 600, whiteSpace: "nowrap" }}>{row.intensity} / 10</td>
                    <td style={{ padding: "8px 12px", color: "var(--text-muted)", minWidth: "150px" }}>{row.trigger}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontSize: "10px",
                        whiteSpace: "nowrap",
                        background: row.direction.includes("上") ? "rgba(16, 185, 129, 0.1)" : row.direction.includes("下") ? "rgba(239, 68, 68, 0.1)" : "rgba(100,100,100,0.1)",
                        color: row.direction.includes("上") ? "#10b981" : row.direction.includes("下") ? "#ef4444" : "var(--text-dim)"
                      }}>{row.direction}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
