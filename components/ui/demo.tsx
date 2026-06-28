import React, { useState } from "react";
import { Bell, Home, HelpCircle, Settings, Shield, Mail, User, FileText, Lock, Pencil, Layers, Cpu } from "lucide-react";
import { ExpandableTabs } from "@/components/ui/expandable-tabs";

function DefaultDemo() {
  const [message, setMessage] = useState<string>("点击标签可展开名称");
  const tabs = [
    { title: "主页", icon: Home },
    { title: "消息", icon: Bell },
    { title: "设置", icon: Settings },
    { title: "帮助", icon: HelpCircle },
    { title: "安全", icon: Shield },
  ] as const;

  return (
    <div className="flex flex-col gap-2">
      <ExpandableTabs 
        tabs={tabs as any} 
        onAction={(index) => setMessage(`第二次点击！触发进入操作，当前页面：${tabs[index]?.title}`)}
        onChange={() => setMessage("第一次点击：已展开名称")}
      />
      <div className="text-xs text-[#8c7759] dark:text-[#a1a1aa] px-2 min-h-[16px]">{message}</div>
    </div>
  );
}

function CustomColorDemo() {
  const [message, setMessage] = useState<string>("点击标签可展开名称");
  const tabs = [
    { title: "个人", icon: User },
    { title: "聊天", icon: Mail },
    { title: "文档", icon: FileText },
    { title: "隐私", icon: Lock },
  ] as const;

  return (
    <div className="flex flex-col gap-2">
      <ExpandableTabs 
        tabs={tabs as any} 
        activeColor="text-blue-500"
        className="border-blue-200 dark:border-blue-800" 
        onAction={(index) => setMessage(`第二次点击！触发进入操作，当前页面：${tabs[index]?.title}`)}
        onChange={() => setMessage("第一次点击：已展开名称")}
      />
      <div className="text-xs text-blue-500 px-2 min-h-[16px]">{message}</div>
    </div>
  );
}

function ImageDemo() {
  const [message, setMessage] = useState<string>("点击第一次展开，再次点击进入功能");
  // Demo representing the toolbar/buttons from the reference image:
  // Shield, Pencil, Layers, Cpu, Settings, HelpCircle
  const tabs = [
    { title: "安全保护", icon: Shield },
    { title: "文本编辑", icon: Pencil },
    { title: "图层大纲", icon: Layers },
    { title: "智能助手", icon: Cpu },
    { title: "系统设置", icon: Settings },
    { title: "使用帮助", icon: HelpCircle },
  ] as const;

  return (
    <div className="flex flex-col gap-2">
      <ExpandableTabs 
        tabs={tabs as any}
        activeColor="text-amber-700 dark:text-amber-500"
        className="border-[#dfd0af] bg-[#fcf8f2] dark:border-[#2c2c34] dark:bg-[#0f0f11]"
        onAction={(index) => setMessage(`🚀 第二次点击！已进入功能模块：${tabs[index]?.title}`)}
        onChange={() => setMessage("第一次点击：已展开中文名称")}
      />
      <div className="text-xs text-amber-700 dark:text-amber-500 px-2 font-medium min-h-[16px]">{message}</div>
    </div>
  );
}

export { DefaultDemo, CustomColorDemo, ImageDemo };
