# ink-xY 全局系统提示词管理后台 — 实现总结

> **路由**：`http://localhost:3030/admin`  
> **日期**：2026-06-15  
> **状态**：✅ 完成并验证

---

## 📦 新增文件

| 文件 | 类型 | 行数 | 说明 |
|------|------|------|------|
| `app/api/admin/prompts/route.ts` | Next.js API Route | 236 | 后端：扫描 / 读取 / 保存 / 还原提示词模板 |
| `app/admin/page.tsx` | React Client Component | 761 | 前端：两栏管理后台 UI |

---

## 🔌 API 设计

### GET `/api/admin/prompts` — 列表模式

递归扫描 `inkos/skills/genres/prompts/` 下所有 `.md` 文件（排除 `.default.md`），返回：

```json
{
  "success": true,
  "prompts": [
    {
      "name": "planner_system_en.md",
      "category": "Planner",
      "language": "en",
      "isModified": false,
      "size": 6603
    }
  ]
}
```

- **分类规则**：根据文件名前缀自动归类（`planner_` → Planner、`writer_` → Writer、`auditor_` → Auditor、`sf_` / `short_fiction/` → Short Fiction 等，共 16 个分类）
- **语言检测**：`_en` → EN、`_zh` → ZH、无后缀 → NEUTRAL
- **修改检测**：与 `.default.md` 备份逐字节比对
- **自动备份**：首次访问时自动为缺少 `.default.md` 的模板创建出厂备份

### GET `/api/admin/prompts?name=<relativePath>` — 单文件模式

返回指定模板的当前内容和默认备份内容：

```json
{
  "success": true,
  "name": "auditor_system_en.md",
  "content": "...",
  "defaultContent": "...",
  "isModified": false
}
```

### POST `/api/admin/prompts` — 操作

| action | 说明 | 所需字段 |
|--------|------|----------|
| `save` | 将 content 写入覆盖原 `.md` 文件 | `name`, `content` |
| `restore` | 从 `.default.md` 备份回滚 | `name` |

---

## 🛡️ 安全设计

- **目录遍历防御**：`safeResolve()` 使用 `path.resolve()` 后严格校验解析路径必须以 `inkos/skills/genres/prompts` 为前缀，对 `../../` 类攻击返回 HTTP 400
- **编辑安全锁**：编辑器区域默认禁用，必须勾选 *"我已知晓修改 Prompt 的高风险，承诺对修改后的指令正确性负责"* 后方可解锁
- **一键还原确认**：Restore 操作带 `window.confirm()` 二次确认弹窗

---

## 🎨 前端 UI 特性

### 布局

- **左侧边栏**（320px）：搜索框 → 分类下拉菜单 → 语言页签（ALL / EN / ZH / NEUTRAL）→ 模板列表
- **右侧主区域**：顶部信息栏 + 三个页签 + 内容区

### 页签

| 页签 | 功能 |
|------|------|
| 📊 Diff View (差异比对) | 基于 LCS 动态规划的行级差异算法，绿色 `+` 增行 / 红色 `-` 删行，Git Diff 风格双列行号 |
| ✏️ Custom File (编辑当前) | 安全锁 + 文本编辑器 + 保存按钮 |
| 📄 Default System Prompt (内置) | 只读展示工厂默认备份 |

### 徽章

- 🟠 `Modified (已修改)` — 橙色高亮，模板与出厂版本不同
- ⚪ `Original (内置)` — 灰色，模板与出厂版本一致

### 主题适配

完全使用 CSS 变量（`var(--bg)`, `var(--bg-panel)`, `var(--border)`, `var(--text)`, `var(--accent)` 等），自动适配系统 Beige Theme / Dark Theme 切换，零硬编码颜色值（diff 行级颜色除外）。

### 零外部依赖

LCS diff 算法、分类逻辑、UI 组件全部纯手写实现，无任何第三方库引入。

---

## ✅ 测试验证

| 测试项 | 结果 |
|--------|------|
| `GET /api/admin/prompts` 列表 | ✅ 66 个模板，分类正确 |
| `GET /api/admin/prompts?name=auditor_system_en.md` 单文件 | ✅ 返回 content + defaultContent |
| `POST save` 修改写入 | ✅ isModified 变为 true |
| `POST restore` 一键还原 | ✅ 回滚到出厂内容 |
| 目录遍历 `../../package.json` | ✅ HTTP 400 拒绝 |
| `GET /admin` 页面加载 | ✅ HTTP 200, 12KB HTML |
| TypeScript 编译 `tsc --noEmit` | ✅ 无类型错误 |

---

## 📂 涉及的提示词模板（66 个）

分类统计：

| 分类 | 数量 | 示例 |
|------|------|------|
| Analyzer | 4 | `analyzer_system_en.md`, `analyzer_user_zh.md` |
| Architect | 4 | `architect_system_zh.md`, `architect_revise_system_en.md` |
| Auditor | 2 | `auditor_system_en.md`, `auditor_system_zh.md` |
| Canon | 1 | `canon_reference_extractor_system.md` |
| Consolidator | 1 | `consolidator_system.md` |
| Detector | 2 | `detector_system_en.md`, `detector_system_zh.md` |
| Draft Helper | 1 | `book_draft_helper_system.md` |
| Fanfic | 1 | `fanfic_importer_system.md` |
| Foundation | 2 | `foundation_reviewer_system_en.md`, `foundation_reviewer_system_zh.md` |
| Normalizer | 2 | `length_normalizer_system.md`, `length_normalizer_user.md` |
| Observer | 4 | `observer_system_en.md`, `observer_user_zh.md` |
| Planner | 6 | `planner_system_en.md`, `planner_golden_opening_zh.md`, `planner_user_en.md` |
| Polisher | 2 | `polisher_system_en.md`, `polisher_system_zh.md` |
| Radar | 1 | `radar_system_zh.md` |
| Reviser | 2 | `reviser_system_en.md`, `reviser_system_zh.md` |
| Settler | 2 | `settler_system_en.md`, `settler_system_zh.md` |
| Short Fiction | 12 | `sf_outline_system.md`, `sf_writer_user.md` 等（位于 `short_fiction/` 子目录） |
| Style Guide | 1 | `style_guide_extractor_system.md` |
| Validator | 1 | `state_validator_system.md` |
| Workbench | 1 | `workbench_chat_system.md` |
| Writer | 14 | `writer_system_en.md`, `writer_craft_card_zh.md`, `writer_golden_opening_en.md` 等 |

---

## 🔗 访问方式

```
http://localhost:3030/admin
```

> ⚠️ 此路由仅作管理用途，主写作台 UI 中无任何入口链接至此页面。
