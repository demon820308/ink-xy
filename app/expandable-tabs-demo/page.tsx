"use client";

import React from "react";
import { DefaultDemo, CustomColorDemo, ImageDemo } from "@/components/ui/demo";

export default function ExpandableTabsDemoPage() {
  return (
    <div className="min-h-screen bg-[#faf6ef] text-[#3b2c1e] p-8 dark:bg-[#0f0f11] dark:text-[#e4e4e7] flex flex-col items-center justify-center gap-12">
      <div className="max-w-2xl w-full text-center space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Expandable Tabs Component</h1>
        <p className="text-sm text-[#8c7759] dark:text-[#a1a1aa]">
          An interactive, animated tab/toolbar component built using Tailwind CSS, Framer Motion, and Lucide React.
        </p>
      </div>

      <div className="w-full max-w-xl p-8 rounded-3xl border border-[#dfd0af] bg-[#fcf8f2] shadow-md dark:border-[#2c2c34] dark:bg-[#1a1a1e] space-y-8">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#ab987a]">Default Demo</h2>
          <DefaultDemo />
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#ab987a]">Custom Color Demo</h2>
          <CustomColorDemo />
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#ab987a]">Image Reference Demo (Toolbar)</h2>
          <p className="text-xs text-[#8c7759] dark:text-[#a1a1aa] mb-2">
            Matches the reference layout and buttons: Shield, Pencil, Layers, Cpu, Settings, HelpCircle.
          </p>
          <ImageDemo />
        </div>
      </div>
    </div>
  );
}
