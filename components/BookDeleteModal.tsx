"use client";

import React, { useState } from "react";
import { Emoji } from "./Emoji";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cwd: string;
  bookId: string;
  onDeleted: () => void;
}

export default function BookDeleteModal({ isOpen, onClose, cwd, bookId, onDeleted }: Props) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/inkos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "book-delete",
          cwd,
          args: { bookId }
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP error ${res.status}`);
      }
      onDeleted();
      onClose();
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg || String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
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
          <Emoji char="⚠️" />
          <span>删除书籍确认 (Delete Book)</span>
        </h3>

        {isDeleting ? (
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
            {error && (
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
                <Emoji char="⚠️" /> {error}
              </div>
            )}
            
            <p style={{ fontSize: "12px", color: "var(--text)", lineHeight: 1.6, margin: "0 0 16px" }}>
              您确定要永久删除书籍 <strong style={{ color: "#ef4444" }}>{bookId}</strong> 吗？
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
                onClick={onClose}
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
                onClick={handleDelete}
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
  );
}
