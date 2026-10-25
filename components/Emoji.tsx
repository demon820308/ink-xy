import React from "react";
import {
  TriangleAlert,
  Lightbulb,
  Search,
  PenLine,
  WandSparkles,
  XCircle,
  X,
  RefreshCw,
  Rocket,
  BookOpen,
  Sparkles,
  Zap,
  CheckCircle2,
  Check,
  Plus,
  PartyPopper,
  FileText,
  FileEdit,
  BarChart3,
  Hourglass,
  Bot,
  ShieldCheck,
  Settings,
  Mic,
  Save,
  Library,
  Drama,
  CornerUpLeft,
  Download,
  Flower2,
  User,
  Eye,
  Target,
  CircleDot,
  Circle,
  Folder,
  FolderOpen,
  Gem,
  Clapperboard,
  UserRound,
  Candy,
  Puzzle,
  Globe,
  Link,
  Pencil,
  Feather,
  Archive,
  Palette,
  Wrench,
  Anchor,
  Radar,
  Magnet,
  Coffee,
  Volume2,
  TrendingUp,
  ClipboardList,
  Trash2,
  ArrowDown,
  Laptop,
  Monitor,
  Lock,
  Crown,
  Leaf,
  Sun,
  Snowflake,
  Wind,
  Siren,
  Flag,
  Ruler,
  Calendar,
  Package,
  Plug,
  Pin,
  Brain,
  Tag,
  ScrollText,
  Laugh,
  Frown,
  AudioWaveform,
  CupSoda,
  TreePine,
  Compass,
  Paperclip,
  BookMarked,
  Image,
  type LucideIcon,
} from "lucide-react";

interface EmojiProps {
  char: string;
  className?: string;
  style?: React.CSSProperties;
}

interface IconDef {
  icon: LucideIcon;
  color?: string;
}

function normalizeKey(str: string): string {
  return str.replace(/[\uFE0E\uFE0F]/g, "").trim();
}

const RAW_ICON_MAP: Record<string, IconDef> = {
  "⚠️": { icon: TriangleAlert, color: "#f59e0b" },
  "💡": { icon: Lightbulb, color: "#eab308" },
  "🔍": { icon: Search, color: "#60a5fa" },
  "✍️": { icon: PenLine, color: "#f97316" },
  "🪄": { icon: WandSparkles, color: "#a855f7" },
  "❌": { icon: XCircle, color: "#ef4444" },
  "✕": { icon: X },
  "✗": { icon: X, color: "#ef4444" },
  "🔁": { icon: RefreshCw, color: "#38bdf8" },
  "🚀": { icon: Rocket, color: "#f43f5e" },
  "📖": { icon: BookOpen, color: "#6366f1" },
  "✨": { icon: Sparkles, color: "#f59e0b" },
  "⚡": { icon: Zap, color: "#eab308" },
  "✅": { icon: CheckCircle2, color: "#10b981" },
  "✓": { icon: Check, color: "#10b981" },
  "➕": { icon: Plus },
  "🎉": { icon: PartyPopper, color: "#f43f5e" },
  "📄": { icon: FileText, color: "#94a3b8" },
  "📝": { icon: FileEdit, color: "#60a5fa" },
  "📊": { icon: BarChart3, color: "#6366f1" },
  "⏳": { icon: Hourglass, color: "#f59e0b" },
  "🤖": { icon: Bot, color: "#818cf8" },
  "🛡️": { icon: ShieldCheck, color: "#10b981" },
  "⚙️": { icon: Settings },
  "🎙️": { icon: Mic, color: "#ec4899" },
  "🎤": { icon: Mic, color: "#ec4899" },
  "💾": { icon: Save, color: "#3b82f6" },
  "📚": { icon: Library, color: "#8b5cf6" },
  "🎭": { icon: Drama, color: "#a855f7" },
  "↩️": { icon: CornerUpLeft },
  "📥": { icon: Download, color: "#3b82f6" },
  "🌸": { icon: Flower2, color: "#f472b6" },
  "👤": { icon: User, color: "#a78bfa" },
  "👁️": { icon: Eye, color: "#38bdf8" },
  "🎯": { icon: Target, color: "#ef4444" },
  "🟢": { icon: CircleDot, color: "#22c55e" },
  "🔴": { icon: CircleDot, color: "#ef4444" },
  "🟡": { icon: CircleDot, color: "#eab308" },
  "🔵": { icon: CircleDot, color: "#3b82f6" },
  "⚪": { icon: Circle, color: "#94a3b8" },
  "📁": { icon: Folder, color: "#f59e0b" },
  "📂": { icon: FolderOpen, color: "#f59e0b" },
  "🔮": { icon: Gem, color: "#a855f7" },
  "🎬": { icon: Clapperboard, color: "#f43f5e" },
  "👩": { icon: UserRound, color: "#f472b6" },
  "👨": { icon: UserRound, color: "#60a5fa" },
  "🧔": { icon: UserRound, color: "#f59e0b" },
  "👧": { icon: UserRound, color: "#fb7185" },
  "👴": { icon: UserRound, color: "#94a3b8" },
  "🍬": { icon: Candy, color: "#f472b6" },
  "🧩": { icon: Puzzle, color: "#8b5cf6" },
  "🌐": { icon: Globe, color: "#38bdf8" },
  "🇨🇳": { icon: Globe, color: "#ef4444" },
  "🇺🇸": { icon: Globe, color: "#3b82f6" },
  "🇬🇧": { icon: Globe, color: "#6366f1" },
  "🇨🇦": { icon: Globe, color: "#f43f5e" },
  "🔗": { icon: Link, color: "#60a5fa" },
  "✏️": { icon: Pencil, color: "#f59e0b" },
  "✎": { icon: Pencil },
  "✒️": { icon: Feather, color: "#d97706" },
  "🗜️": { icon: Archive, color: "#f97316" },
  "🎨": { icon: Palette, color: "#ec4899" },
  "🛠️": { icon: Wrench, color: "#94a3b8" },
  "🔧": { icon: Wrench, color: "#94a3b8" },
  "🪝": { icon: Anchor, color: "#f59e0b" },
  "📡": { icon: Radar, color: "#38bdf8" },
  "🧲": { icon: Magnet, color: "#ef4444" },
  "☕": { icon: Coffee, color: "#d97706" },
  "🔊": { icon: Volume2, color: "#3b82f6" },
  "📈": { icon: TrendingUp, color: "#10b981" },
  "📋": { icon: ClipboardList, color: "#60a5fa" },
  "🗑️": { icon: Trash2, color: "#ef4444" },
  "⬇️": { icon: ArrowDown },
  "💻": { icon: Laptop, color: "#60a5fa" },
  "🖥️": { icon: Monitor, color: "#60a5fa" },
  "🔒": { icon: Lock, color: "#f59e0b" },
  "🔑": { icon: Lock, color: "#eab308" },
  "👑": { icon: Crown, color: "#eab308" },
  "🍂": { icon: Leaf, color: "#d97706" },
  "☀️": { icon: Sun, color: "#f59e0b" },
  "❄️": { icon: Snowflake, color: "#38bdf8" },
  "💨": { icon: Wind, color: "#94a3b8" },
  "😮‍💨": { icon: Wind, color: "#94a3b8" },
  "🚨": { icon: Siren, color: "#ef4444" },
  "🚩": { icon: Flag, color: "#ef4444" },
  "📏": { icon: Ruler, color: "#f59e0b" },
  "📅": { icon: Calendar, color: "#60a5fa" },
  "📦": { icon: Package, color: "#f59e0b" },
  "🔌": { icon: Plug, color: "#10b981" },
  "📌": { icon: Pin, color: "#ef4444" },
  "🧠": { icon: Brain, color: "#ec4899" },
  "🏷️": { icon: Tag, color: "#f59e0b" },
  "🌌": { icon: Sparkles, color: "#818cf8" },
  "📜": { icon: ScrollText, color: "#d97706" },
  "😂": { icon: Laugh, color: "#f59e0b" },
  "😢": { icon: Frown, color: "#60a5fa" },
  "😷": { icon: AudioWaveform, color: "#94a3b8" },
  "🥛": { icon: CupSoda, color: "#60a5fa" },
  "🌲": { icon: TreePine, color: "#10b981" },
  "🦘": { icon: Compass, color: "#f59e0b" },
  "📎": { icon: Paperclip },
  "📘": { icon: BookMarked, color: "#3b82f6" },
  "🖼️": { icon: Image, color: "#a855f7" },
};

const EMOJI_ICON_MAP: Record<string, IconDef> = {};
for (const [k, v] of Object.entries(RAW_ICON_MAP)) {
  EMOJI_ICON_MAP[k] = v;
  EMOJI_ICON_MAP[normalizeKey(k)] = v;
}

const SPLIT_EMOJI_REGEX = /(\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*|[✕✗✓✎])/gu;

export function hasEmojiIcon(char: string): boolean {
  return Boolean(EMOJI_ICON_MAP[normalizeKey(char)]);
}

export function Emoji({ char, className, style }: EmojiProps) {
  const def = EMOJI_ICON_MAP[normalizeKey(char)];
  if (def) {
    const Icon = def.icon;
    const iconColor = style?.color ?? def.color ?? "currentColor";
    return (
      <span
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          verticalAlign: "-0.125em",
          lineHeight: 1,
          flexShrink: 0,
          ...style,
          color: iconColor,
        }}
      >
        <Icon style={{ width: "1em", height: "1em", display: "block" }} strokeWidth={2} />
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{
        fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
        display: "inline-block",
        verticalAlign: "middle",
        fontWeight: 400,
        fontStyle: "normal",
        fontSynthesis: "none",
        fontVariantEmoji: "emoji",
        ...style,
      }}
    >
      {char}
    </span>
  );
}

export function renderWithEmoji(text: string): React.ReactNode {
  if (!text) return text;
  const parts = text.split(SPLIT_EMOJI_REGEX);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part && EMOJI_ICON_MAP[normalizeKey(part)]) {
      return <Emoji key={i} char={part} style={{ marginRight: 3 }} />;
    }
    return part;
  });
}
