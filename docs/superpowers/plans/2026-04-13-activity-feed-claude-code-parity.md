# Activity Feed — Claude Code 展示效果对齐计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AgentCadence 活动面板中，有选择地对齐 `~/work/claude-code-src` 中「对话流」类展示能力（工具状态、结果摘要、Todo、思考 Markdown、列表样式），**不**复制 Ink 终端、权限弹窗全屏、虚拟滚动等 REPL 专用实现。

**Architecture:** 延续现有管道：`CLI presenter` 解析 JSONL → 发出 `AgentStreamUiEvent` → `[applyAgentStreamEvent](src/shared/agent-feed-merge.ts)` 归并 → WebSocket `agent_stream_event` → `[AgentActivityFeed](src/client/components/execution/AgentActivityFeed.tsx)` 渲染。新增事件/字段仅在 **有稳定 JSON 来源** 时落地；缺字段时保持当前行为。

**Tech stack:** TypeScript、React 18、Vite、既有 `react-markdown` / `remark-gfm` / `highlight.js`、Zustand store、Express WS。

---

## 迭代需求（用户反馈，P0 优先于原 Phase A）

以下问题须在实现 Todo/工具摘要等新功能 **之前** 处理，否则新字段会叠在重复卡片上。

### 问题 1：进行中 → 完成显示成两条

**根因（当前实现）：** `[agent-feed-merge.ts](src/shared/agent-feed-merge.ts)` 用 `toolStableKey = callId ?? summary` 判断是否为「同一次调用」。Cursor（或部分 JSONL）在 `started` 与 `completed` 行上经常出现：`**callId` 只在一侧出现**、或 `**summary` 在完成行变长/文案不同**，导致 **key 不一致**，`completed` 走 `pushItem` 变成第二条。

**目标：** 同一次工具调用在活动面板 **始终一条**，`phase` 从 `started`/`update` 更新到 `completed`（必要时合并 `resultPreview`/`ok`）。

**改法（合并策略，按顺序尝试）：**

1. 维持现有逻辑：`callId` 相同则合并。
2. **回退匹配**：若无匹配，从尾部向前查找 **最后一条** `kind === 'tool'` 且 `phase !== 'completed'` 且 `toolName === incoming.toolName` 且 `detail === incoming.detail`（二者皆存在时）的项，将 `completed`/`update` 合并进去。
3. **再回退**：若 `detail` 缺失，仅用 `toolName` 匹配 **最后一条未完成 tool**（仅在 **恰好一条** 未完成时合并，避免误把 A 的完成合并到 B）。
4. **Presenter 侧（cursor-presenter）：** 在 `CursorStreamJsonPrettifier` 内维护 `private lastToolCallIdByKey = new Map<string, string>()`，key 为 `toolName:detail` 或 `summary` 的稳定部分，在收到 `started` 时写入 `call_id`；若 `completed` 行缺 `call_id`，用 Map 补全后再 `ui()`，保证事件层 `callId` 一致。

### 问题 2：仍有重复输出

除工具外需逐项排查：


| 来源                     | 处理                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| 连续 `user_turn`         | 见问题 3                                                                                                       |
| 连续 `session_init`      | `merge`：若 `last.kind === 'init'`，更新 `model`/`cwd` 而非再 `push`（可选）                                            |
| 连续 `turn_result`       | 若上一条已是 `result` 且时间窗口同一轮，可合并为一条或丢弃重复（先记录 `durationMs`/`ok` 更完整者）                                            |
| `assistant`/`thinking` | 已有 `mergeTail`；若仍重复，检查是否 **两条 assistant 块**（中间插了 tool）导致无法合并——属预期；若 **同一块内** 重复，查 presenter 是否对同一 delta 发两次 |


### 问题 3：「用户用户用户」类输出去掉

**根因：** `type: user` 每来一行 JSONL 就 `pushItem(user_turn)`，多轮对话或流式重复会产生多条仅占位的「用户」气泡。

**目标：** 活动面板 **不再展示** 该类占位；终端日志仍可保留 `emit('— user message')`。

**改法：**

1. `[cursor-presenter.ts](src/server/services/cli-output/cursor-presenter.ts)`：`if (t === 'user')` 分支 **删除** `this.ui({ kind: 'user_turn' })`，仅保留 `emit(...)`。
2. `[claude-presenter.ts](src/server/services/cli-output/claude-presenter.ts)`：同上，移除对 `user_turn` 的 `ui()`。
3. `[agent-feed-merge.ts](src/shared/agent-feed-merge.ts)`：`case 'user_turn'` 改为 **no-op**（忽略事件），这样旧快照/重放仍不会新增占位；或若确定无兼容需求可删除该 case。
4. `[AgentActivityFeed.tsx](src/client/components/execution/AgentActivityFeed.tsx)`：可 **删除** `case 'user_turn'` 分支（或保留渲染但永不到达）；类型 `AgentFeedItem` 可保留 `user_turn` 以便读历史 JSON，或后续清理类型。

---

## 与 claude-code-src 的能力对照（摘要）


| claude-code-src 能力                                       | AgentCadence 现状         | 本计划中的位置                            |
| -------------------------------------------------------- | ----------------------- | ---------------------------------- |
| `Markdown` + `cliHighlight` / 禁用高亮                       | `AgentMarkdownBody` 已具备 | Phase B：思考区复用 + GFM 任务列表样式         |
| `AssistantThinkingMessage` 展开 / Ctrl+O 提示                | 折叠 + Loader2            | Phase B：Markdown + 弱化样式            |
| `AssistantToolUseMessage` + `ToolUseLoader`（闪烁 ●、错误/成功色） | 色条 + 文字徽标               | Phase A：工具完成态 `ok` + 结果摘要          |
| `UserToolResultMessage` / tool 专属 `renderToolUseMessage` | 无 tool 结果正文             | **Phase A（推荐）**：通用 `resultPreview` |
| `GroupedToolUseContent` / `CollapsedReadSearchContent`   | 无                       | Phase C（可选）：启发式合并                  |
| `MessageResponse` ⎿ 嵌套前缀                                 | 无                       | **不实现**（Web 布局不适用）                 |
| 各类 `*PermissionRequest`                                  | `ExecutionMonitor` 审查条  | **不实现**（已有平行能力）                    |
| Transcript 搜索高亮 / `OffscreenFreeze`                      | 无                       | **不实现**（除非性能实测瓶颈）                  |
| Todo / 任务列表（模型 tool）                                     | 无                       | **Phase A（推荐）**：`todo_snapshot` 块  |


---

## 推荐实现范围（作者建议）

**Phase P0 — 必须先做（用户反馈：去重、单卡工具、去掉用户占位）**

1. 按上文「迭代需求」修改 `agent-feed-merge`（tool 回退匹配 + 可选 `user_turn` 忽略）、`cursor-presenter` / `claude-presenter`（去掉 `user_turn` 的 `ui`、可选 Map 补全 `callId`）、`AgentActivityFeed`（去掉用户气泡）。验证：同工具仅一条卡片且状态从进行中变为完成；面板无连续「用户」。

**Phase A — 优先做（价值/成本比最高）**

1. **工具完成态展示增强**：在 feed 的 tool 条目中携带 `ok` + `resultPreview`（截断文本），活动面板折叠区内展示，错误时用红色边框/文案（对齐 `ToolUseLoader` 成功/失败语义，不必复制闪烁 ●）。
2. **Todo 列表块**：当流中出现 `todo_write` 类 tool（或 Cursor/Claude JSON 中可解析的等效结构）时，发出 `todo_snapshot` 事件，归并为单一 `AgentFeedItem`，UI 为可折叠 checklist（只读展示即可，不与 IDE 双向同步）。

**Phase B — 其次**

1. **思考内容 Markdown**：思考展开区用 `AgentMarkdownBody` + `dim` 类（不必实现 Ctrl+O 键盘提示，可用现有 Chevron 按钮）。
2. **Markdown 任务列表样式**：在 `[AgentMarkdownBody.tsx](src/client/components/execution/AgentMarkdownBody.tsx)` 为 `remark-gfm` 生成的 task list 增加 `input[type=checkbox]` 与 `li` 样式，使助手正文中的 `- [ ]` 可读性接近 Claude Code。

**Phase C — 可延后**

1. **读/搜工具折叠组**：连续多条 `read_file`/`grep` 在 N 秒窗口内合并为一条「N 次读取」摘要（需合并逻辑 + 可逆展开），复杂度高，易与真实重复调用混淆。

**明确不做（本计划范围外）**

- Ink / ANSI / `MessageResponse` ⎿ 布局
- 完整 Tool 注册表与每个 tool 的自定义 JSX（与 claude-code-src `Tool.js` 同规模）
- 虚拟滚动、transcript 内搜索

---

## 文件结构（将创建 / 修改）


| 文件                                                                                                               | 职责                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `[src/shared/types.ts](src/shared/types.ts)`                                                                     | 扩展 `AgentStreamUiEvent` / `AgentFeedItem`：`tool` 可选 `ok`、`resultPreview`；新增 `todo_snapshot` 事件与 `todo` feed 项 |
| `[src/shared/agent-feed-merge.ts](src/shared/agent-feed-merge.ts)`                                               | **P0：** tool 回退匹配、`user_turn` 忽略；**原 Task 2：** 合并 `tool` 完成态字段；`todo_snapshot`                                |
| `[src/server/services/cli-output/cursor-presenter.ts](src/server/services/cli-output/cursor-presenter.ts)`       | `tool_call` `completed` 时抽取结果摘要；识别 todo tool 发 `todo_snapshot`                                                |
| `[src/server/services/cli-output/claude-presenter.ts](src/server/services/cli-output/claude-presenter.ts)`       | 若有 `tool_result` 行或完成态，发 `resultPreview` / `ok`（按实际 JSONL 形状增量）                                               |
| `[src/server/services/cli-output/codex-presenter.ts](src/server/services/cli-output/codex-presenter.ts)`         | 在已有 command/file 完成事件上附带输出摘要（若 JSON 含）                                                                        |
| `[src/client/components/execution/AgentActivityFeed.tsx](src/client/components/execution/AgentActivityFeed.tsx)` | 工具块展示 `resultPreview`；新增 `todo` 块 UI                                                                          |
| `[src/client/components/execution/AgentMarkdownBody.tsx](src/client/components/execution/AgentMarkdownBody.tsx)` | 可选 `variant="dim"`；task list 样式                                                                               |
| `[src/client/i18n/en.ts](src/client/i18n/en.ts)` / `[zh.ts](src/client/i18n/zh.ts)`                              | `toolResult`、`todoTitle` 等文案                                                                                  |


---

### Task 0: P0 — 工具单卡合并 + 去掉 user_turn 展示

**Files:**

- Modify: `[src/shared/agent-feed-merge.ts](src/shared/agent-feed-merge.ts)`
- Modify: `[src/server/services/cli-output/cursor-presenter.ts](src/server/services/cli-output/cursor-presenter.ts)`
- Modify: `[src/server/services/cli-output/claude-presenter.ts](src/server/services/cli-output/claude-presenter.ts)`
- Modify: `[src/client/components/execution/AgentActivityFeed.tsx](src/client/components/execution/AgentActivityFeed.tsx)`
- **Step 1: `applyAgentStreamEvent` 中 `case 'user_turn'` 改为直接 `break`（不 `pushItem`）**

保留 `switch` 分支以便显式文档化「已弃用」。

- **Step 2: 扩展 `case 'tool'` 合并逻辑**

在现有「`last` 同 key」判断 **之前或之后** 增加函数 `findOpenToolIndex(next, incoming): number`：

- 从 `next.length - 1` 向前扫描，找第一个 `kind === 'tool' && phase !== 'completed'` 且与 `incoming` 的 `toolName`、`detail`（均定义时）全相等者；返回索引。
- 若未找到且 `incoming.phase` 为 `update` 或 `completed`，再尝试：仅匹配 `toolName` 相等且 **未完成 tool 恰好一条**（计数扫描）。
- 若找到索引 `j`，则对 `next[j]` 原地更新 `phase`、`summary`（取更长）、`toolName`/`detail`/`callId`（非空则覆盖），然后 `return next`（或 `break` 后统一 return）。

确保与现有 `toolStableKey(last) === key` 分支 **不重复执行**：可先算 `openIdx`，若 `openIdx >= 0` 则走回退合并并 `break`，否则再走原 `last === next[next.length-1]` 逻辑。

- **Step 3: cursor-presenter — 去掉 `user_turn` 的 `ui`**

```typescript
if (t === 'user') {
  emit(`${DIM}— user message${RST}\n`);
  return;
}
```

- **Step 4: claude-presenter — 去掉 `user` 分支中的 `ui({ kind: 'user_turn' })`**

仅保留终端 `emit`。

- **Step 5（可选但推荐）: cursor-presenter 内 Map 补全 `callId`**

类字段：`private toolCallIdHints = new Map<string, string>()`，key = `${parsed.toolName}\0${parsed.detail ?? ''}`，value = `parsed.callId`。在 `tool_call` `started` 时写入；在 `completed`/`update` 时若 `parsed.callId` 为空则从 Map 取并赋给发往 `ui` 的对象。

- **Step 6: AgentActivityFeed 删除 `case 'user_turn'` UI 分支**

避免历史 feed 中残留旧数据仍显示（若 Step 1 已忽略新事件，旧数据可一次性在 `runPipeline` 清空时已无；若 hydrate 仍含 `user_turn`，删除 `case` 后 fall-through `default` 返回 `null` 不渲染）。

- **Step 7: `npm run build` + `npm run test:harness`**
- **Step 8: Commit**

```bash
git add src/shared/agent-feed-merge.ts src/server/services/cli-output/cursor-presenter.ts src/server/services/cli-output/claude-presenter.ts src/client/components/execution/AgentActivityFeed.tsx
git commit -m "fix(activity-feed): single tool card lifecycle, drop user_turn from UI"
```

---

### Task 1: 扩展共享类型（tool 结果字段 + todo）

**Files:**

- Modify: `[src/shared/types.ts](src/shared/types.ts)`
- **Step 1: 在 `AgentStreamUiEvent` 的 `tool` 分支增加可选字段**

在 `kind: 'tool'` 的对象上增加（全部为可选，旧客户端/旧快照兼容）：

```typescript
/** 工具结束时附带的短摘要（stdout/消息截断） */
resultPreview?: string;
/** 工具是否成功完成；false 表示失败或 is_error */
ok?: boolean;
```

- **Step 2: 增加 todo 事件与 feed 项**

在 `AgentStreamUiEvent` 联合中追加：

```typescript
| {
    kind: 'todo_snapshot';
    items: Array<{
      id: string;
      content: string;
      status: 'pending' | 'in_progress' | 'completed';
    }>;
  };
```

在 `AgentFeedItem` 联合中追加：

```typescript
| {
    kind: 'todo';
    items: Array<{
      id: string;
      content: string;
      status: 'pending' | 'in_progress' | 'completed';
    }>;
  };
```

- **Step 3: 在 `AgentFeedItem` 的 `tool` 分支增加与事件对称的可选字段**

```typescript
resultPreview?: string;
ok?: boolean;
```

- **Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): tool result fields and todo_snapshot for activity feed"
```

---

### Task 2: agent-feed-merge 归并逻辑

**Files:**

- Modify: `[src/shared/agent-feed-merge.ts](src/shared/agent-feed-merge.ts)`
- **Step 1: 在 `case 'tool'` 合并分支中写入 `resultPreview` / `ok`**

当 `last.phase !== 'completed'` 且收到 `update` 或 `completed` 时，除现有 `phase`/`summary`/`detail` 外：

```typescript
if (event.ok !== undefined) last.ok = event.ok;
if (event.resultPreview !== undefined) last.resultPreview = event.resultPreview;
```

在 `pushItem` 新建 `incoming` 时传入 `ok`、`resultPreview`（若存在）。

- **Step 2: 处理 `todo_snapshot`**

在 `switch (event.kind)` 中增加：

```typescript
case 'todo_snapshot': {
  const next = [...feed];
  const last = next[next.length - 1];
  if (last?.kind === 'todo') {
    last.items = event.items.map((i) => ({ ...i }));
  } else {
    pushItem(next, { kind: 'todo', items: event.items.map((i) => ({ ...i })) });
  }
  trimFeed(next);
  return next;
}
```

若希望「每次快照新卡片」可改为始终 `pushItem`；**推荐**合并到同一条 `todo` 直至出现 `session_init` 或新的 pipeline run 清空 feed；若上游只发全量快照，合并为单卡即可。

- **Step 3: 运行 TypeScript 编译**

```bash
npm run build:server
```

预期：无类型错误。

- **Step 4: Commit**

```bash
git add src/shared/agent-feed-merge.ts
git commit -m "feat(feed-merge): merge tool result fields and todo snapshots"
```

---

### Task 3: Cursor presenter — tool 完成摘要 + todo 检测

**Files:**

- Modify: `[src/server/services/cli-output/cursor-presenter.ts](src/server/services/cli-output/cursor-presenter.ts)`
- **Step 1: 用真实 JSONL 确认字段（一次性）**

本地对真实 `cursor-agent --output-format stream-json` 抓一条 `type":"tool_call","subtype":"completed"` 的样例行（可临时设 `AGENTCADENCE_CURSOR_RAW_STREAM_JSON=1` 把原始行打进日志）。记录：结果文本所在字段名（例如嵌套在 `tool_call` 下或顶层 `result`）。

- **Step 2: 实现 `extractToolResultPreview(obj: Record<string, unknown>): { preview?: string; ok?: boolean }`**

优先从 `completed` 行解析；`ok` 默认 `true`，若存在 `is_error === true` 或 `success === false` 则 `ok: false`。`preview` 为字符串截断至例如 600 字符，去除控制字符。

- **Step 3: 在 `tool_call` 分支 `this.ui({...})` 中合并 `...extractToolResultPreview(obj)`**

仅在 `phase === 'completed'` 时填充 `resultPreview`/`ok`。

- **Step 4: Todo 检测**

若 `parseCursorToolCallForUi` 得到的 `toolName` 为 `todo_write`（或 Cursor 实际使用的名称，以 Step 1 样例为准），在 `started` 或 `completed` 时从 `tool_call` 解析 `todos` 数组，调用：

```typescript
this.ui({ kind: 'todo_snapshot', items: normalized });
```

`normalized` 将任意形状映射为 `id`/`content`/`status`（缺 `id` 时用索引字符串）。

- **Step 5: Commit**

```bash
git add src/server/services/cli-output/cursor-presenter.ts
git commit -m "feat(cursor-presenter): tool result preview and todo_snapshot events"
```

---

### Task 4: Claude / Codex presenter（最小增量）

**Files:**

- Modify: `[src/server/services/cli-output/claude-presenter.ts](src/server/services/cli-output/claude-presenter.ts)`
- Modify: `[src/server/services/cli-output/codex-presenter.ts](src/server/services/cli-output/codex-presenter.ts)`
- **Step 1: Claude — 若 JSONL 中存在独立的 tool_result 或完成行**

仅当在当前仓库解析路径中**已存在**可挂钩的 `tool_result` 文本时，发出带 `resultPreview` 的 `tool` 事件或单独 `kind`（与 Task 1 类型一致）。若无稳定行类型，**跳过本文件改动**并在 commit message 中注明 `chore(claude-presenter): no tool_result line in stream-json path yet`。

- **Step 2: Codex — `command_execution` completed**

若 `aggregated_output` 存在，将 `truncate(out, 400)` 作为 `resultPreview` 填入已完成 `tool` 的 `ui` 调用。

- **Step 3: `npm run build:server`**

预期：通过。

- **Step 4: Commit**

```bash
git add src/server/services/cli-output/claude-presenter.ts src/server/services/cli-output/codex-presenter.ts
git commit -m "feat(cli-output): resultPreview for codex/claude where available"
```

---

### Task 5: AgentActivityFeed UI

**Files:**

- Modify: `[src/client/components/execution/AgentActivityFeed.tsx](src/client/components/execution/AgentActivityFeed.tsx)`
- Modify: `[src/client/i18n/en.ts](src/client/i18n/en.ts)`
- Modify: `[src/client/i18n/zh.ts](src/client/i18n/zh.ts)`
- **Step 1: i18n 增加键**

`execution.toolResult`（en: `Result`, zh: `结果`），`execution.todoTitle`（en: `Tasks`, zh: `任务`）。

- **Step 2: 在 `case 'tool'` 展开区域底部增加结果区**

当 `item.resultPreview` 存在时渲染：

```tsx
<div
  className={`mt-2 text-[11px] font-mono rounded-md p-2 border theme-bg-0 whitespace-pre-wrap max-h-40 overflow-y-auto ${
    item.ok === false ? 'border-red-500/40 text-red-200/90' : 'border-[var(--color-border)] theme-text-muted'
  }`}
>
  {item.resultPreview}
</div>
```

`item.ok === undefined` 时用中性边框。

- **Step 3: 新增 `case 'todo'`**

可折叠块：标题 `labels.todoTitle`，内部列表映射 `items`，`status === 'completed'` 用删除线或勾选图标（`lucide-react` `CheckCircle2` / `Circle`），`in_progress` 用 `Loader2` 或高亮点。

- **Step 4: 扩展 `AgentActivityFeedLabels` 类型**

增加 `toolResult: string; todoTitle: string;`，`[ExecutionMonitor.tsx](src/client/components/execution/ExecutionMonitor.tsx)` 传入 `t.execution.*`。

- **Step 5: `npm run build`**

预期：客户端编译通过。

- **Step 6: Commit**

```bash
git add src/client/components/execution/AgentActivityFeed.tsx src/client/components/execution/ExecutionMonitor.tsx src/client/i18n/en.ts src/client/i18n/zh.ts
git commit -m "feat(ui): show tool result preview and todo list in activity feed"
```

---

### Task 6: 思考区 Markdown + GFM 任务列表样式（Phase B）

**Files:**

- Modify: `[src/client/components/execution/AgentMarkdownBody.tsx](src/client/components/execution/AgentMarkdownBody.tsx)`
- Modify: `[src/client/components/execution/AgentActivityFeed.tsx](src/client/components/execution/AgentActivityFeed.tsx)`
- **Step 1: `AgentMarkdownBody` 增加可选 `variant?: 'default' | 'dim'`**

根节点 class：`variant === 'dim'` 时追加 `opacity-85 text-[12px]`（或专用 `theme-text-muted`）。

- **Step 2: 自定义 `li` 与 `input`（task list）**

检测 `props.className?.includes('task-list-item')`（remark-gfm 惯例）或为子节点含 `input[type=checkbox]` 时应用 flex 行布局；`input` 只读 `disabled` + `pointer-events-none`，样式对齐主题。

- **Step 3: 思考展开区**

将 `<pre>{item.text}</pre>` 替换为 `<AgentMarkdownBody variant="dim" text={item.text} />`。

- **Step 4: `npm run build`**
- **Step 5: Commit**

```bash
git add src/client/components/execution/AgentMarkdownBody.tsx src/client/components/execution/AgentActivityFeed.tsx
git commit -m "feat(ui): dim markdown for thinking and GFM task list styling"
```

---

### Task 7: 验证

**Files:** 无新文件

- **Step 1: 单元级（可选）**

若添加 `src/shared/agent-feed-merge.test.ts`（需确认项目是否已有 vitest/jest；**若无测试运行器，跳过文件创建**，仅手测）。

手测清单：

1. 运行带 Cursor `stream-json` 的 pipeline，确认工具完成后折叠区内出现结果摘要。
2. 触发一次含 `todo_write` 的对话（若模型支持），确认任务列表出现且更新不刷屏。
3. 助手正文含 `- [ ]` / `- [x]` 时列表可读。

- **Step 2: 运行现有 harness**

```bash
npm run test:harness
```

预期：输出末尾 `[harness] OK`。

- **Step 3: Commit（仅当有测试文件时）**

---

## Self-review（对照本计划）

1. **Spec coverage:** Phase A 覆盖工具结果 + Todo；Phase B 覆盖思考 Markdown + 正文任务列表；Phase C 单独列出折叠组未写实现步骤（避免占位代码）。**缺口：** 具体 Cursor `completed` JSON 字段名依赖 Task 3 Step 1 样例 — 已在计划中用强制抓样步骤消除 TBD。
2. **Placeholder scan：** 无 `TBD` / `implement later`；Claude 增量明确「无则跳过」。
3. **Type consistency：** `todo_snapshot` / `todo` / `tool` 字段在 Task 1–2 对齐；presenter 与 merge 使用相同 `kind` 名。

---

## Execution handoff

**Plan complete and saved to `[docs/superpowers/plans/2026-04-13-activity-feed-claude-code-parity.md](docs/superpowers/plans/2026-04-13-activity-feed-claude-code-parity.md)`.**

**1. Subagent-Driven（推荐）** — 每个 Task 派生子代理，任务间人工过一眼，迭代快。

**2. Inline Execution** — 本会话按 Task 顺序实现，每 2–3 个 Task 设检查点。

**Which approach?**