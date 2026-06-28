"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOnClickOutside } from "usehooks-ts";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface Tab {
  title: string;
  icon: LucideIcon;
  type?: never;
}

interface Separator {
  type: "separator";
  title?: never;
  icon?: never;
}

type TabItem = Tab | Separator;

interface ExpandableTabsProps {
  tabs: TabItem[];
  className?: string;
  style?: React.CSSProperties;
  activeColor?: string;
  onChange?: (index: number | null) => void;
  onAction?: (index: number) => void;
}

const spanVariants = {
  initial: { width: 0, opacity: 0, marginLeft: 0 },
  animate: { width: "auto", opacity: 1, marginLeft: 6 },
  exit: { width: 0, opacity: 0, marginLeft: 0 },
};

const transition = { type: "tween", ease: "easeOut", duration: 0.2 } as const;

export function ExpandableTabs({
  tabs,
  className,
  style,
  activeColor,
  onChange,
  onAction,
}: ExpandableTabsProps) {
  const [selected, setSelected] = React.useState<number | null>(null);
  const outsideClickRef = React.useRef<HTMLDivElement>(null);

  useOnClickOutside(outsideClickRef as any, () => {
    setSelected(null);
    onChange?.(null);
  });

  const handleSelect = (index: number) => {
    if (selected === index) {
      onAction?.(index);
    } else {
      setSelected(index);
      onChange?.(index);
    }
  };

  const Separator = () => (
    <div 
      style={{
        marginLeft: "4px",
        marginRight: "4px",
        height: "18px",
        width: "1.2px",
        background: "var(--border)",
      }} 
      aria-hidden="true" 
    />
  );

  return (
    <div
      ref={outsideClickRef}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        borderRadius: "8px",
        border: "1px solid var(--border)",
        background: "var(--bg-panel)",
        padding: "2px",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
        ...style
      }}
      className={cn(className)}
    >
      {tabs.map((tab, index) => {
        if (tab.type === "separator") {
          return <Separator key={`separator-${index}`} />;
        }

        const Icon = tab.icon;
        const isSelected = selected === index;
        return (
          <motion.button
            key={tab.title}
            onClick={() => handleSelect(index)}
            transition={transition}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "6px",
              border: "none",
              background: isSelected ? "var(--bg-selected)" : "transparent",
              color: isSelected ? (activeColor || "var(--accent)") : "var(--text-muted)",
              cursor: "pointer",
              fontFamily: "var(--font-serif)",
              fontWeight: 600,
              fontSize: "11px",
              outline: "none",
              transition: "all 0.3s ease",
              height: "24px",
              paddingLeft: "0.625rem",
              paddingRight: "0.625rem",
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }
            }}
          >
            <Icon size={14} style={{ flexShrink: 0 }} />
            <AnimatePresence initial={false}>
              {isSelected && (
                <motion.span
                  variants={spanVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={transition}
                  style={{
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    display: "inline-block",
                    fontFamily: "var(--font-serif)",
                  }}
                >
                  {tab.title}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}
