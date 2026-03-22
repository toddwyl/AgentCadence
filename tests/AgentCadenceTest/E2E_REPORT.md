# AgentCadence 端到端测试报告（浏览器 + API）

## 测试信息

| 项 | 值 |
|----|---|
| 日期 | 2026-03-22 |
| 前端 | `http://localhost:3712`（`npm run build` + `node dist/server/index.js`） |
| 构建 | `npm run build` — **通过** |

## 自动化 API 冒烟

执行：`node scripts/agentcadence-smoke.mjs`（后端已监听 `3712`）

**结果：7/7 通过**（`GET /pipelines`、`GET /fs/home`、创建空 Pipeline、模板列表、从模板创建、`POST .../demo`、demo 四步均为 `cursor`）。

## 浏览器交互（Playwright）

以下在真实页面点击验证，**控制台 error 级别：0**。

| 功能 | 结果 | 说明 |
|------|------|------|
| **Templates** | 通过 | 打开「Pipeline Templates」；可见 Import MD / Save as Template / Close；列表与 Use Template 等按钮可点 |
| **Insights** | 通过 | Data Insights 统计与表格正常展示 |
| **Run Monitor** | 通过 | Running / History 切换正常；历史记录含步骤树与摘要 |
| **Orchestration View** | 通过 | 流程图渲染；再次点击关闭回到编排编辑 |
| **Save MD** | 通过 | 触发下载（文件名随当前 Pipeline 名称，如 `*.md`） |
| **New Pipeline** | 通过 | 表单含模板下拉、工作目录、Browse、Create/Cancel |
| **AI Generate** | 通过 | 弹窗、工作目录、任务描述；未填写时 Generate 为禁用 |
| **Settings** | 通过 | Theme / Language、Detect Environment 显示 cursor-agent / codex / claude 路径 |
| **全局变量 + 步骤** | 通过（此前会话） | `test_e2e` 保存后步骤内显示 `{{test_e2e}}`；Prompt `/` 补全可用 |

## 完整 Run 流水线（不依赖 LLM）

为在 CI / 本地**稳定、秒级**验证调度、持久化 `runHistory`、WebSocket 与 Run Monitor，使用 **自定义 Shell 步骤**（`command: echo …`），不调用 `cursor-agent` / Codex / Claude。

### 自动化脚本

```bash
cd <仓库根目录>
npm run test:e2e-run
# 或: AGENTCADENCE_URL=http://localhost:3712 node scripts/agentcadence-e2e-full-run.mjs
```

脚本行为：创建 `E2E-FullRun-*` Pipeline（1 阶段 1 步）→ `POST /api/execution/:id/run` → 轮询直至 `runHistory` 出现且 **`status === 'completed'`**。

**最近一次执行示例**：`runStatus: "completed"`，`durationMs` 约几十毫秒；步骤输出含 `AGENTCADENCE_E2E_OK`。

### 浏览器点击 Run（同一 Pipeline）

在侧栏选中 **`E2E-FullRun-…`**（1 stages / 1 steps），点击 Header **Run**：自动打开 **Run Monitor**，状态 **Completed**；选中 **Shell smoke** 可查看保存的输出。

### 与「真实 Agent」Run 的区别

- **Shell 验证**：覆盖 **执行引擎 + 历史 + UI**，成本为零。  
- **真实 Cursor 步骤**：见下节（本机需已安装并可用 `cursor-agent`，依赖账号与网络）。

## 真实 Cursor（cursor-agent）Run

使用 **无自定义 `command`** 的步骤，`tool: cursor`，`model: auto`，由服务端按 `DEFAULT_CLI_PROFILE` 调用 **`cursor-agent`**（与日常编排一致）。

### 自动化脚本

```bash
cd <仓库根目录>
npm run test:e2e-cursor
# 可选：AGENTCADENCE_CURSOR_PROMPT="..." AGENTCADENCE_RUN_TIMEOUT_MS=900000   (仍兼容 AGENTLINE_* / AGENTFLOW_*)
```

脚本会创建 `E2E-CursorAgent-*`（1 阶段 1 步），触发 **`POST /api/execution/:id/run`** 并轮询 `runHistory`。

**在本机已执行的一次结果**：`runStatus: "completed"`，`durationMs` 约 **11s**；步骤输出为 **`CURSOR_E2E_OK`**（与提示词要求一致）。若失败，请检查 `cursor-agent` 路径、登录与网络；单步默认最长约 **600s** 进程超时（见 `cli-runner`）。

## 本次代码修复（与 E2E 发现一致）

**问题**：默认 Cursor / Planner 模型使用 `opus-4.6`，与本机 `cursor-agent` 可用模型列表不一致，导致步骤失败（Run Monitor / Insights 中可见相关错误）。

**修改**：

1. 将默认模型统一为 CLI 支持的 **`auto`**，并更新 Cursor 工具在 UI 中的建议模型列表（`src/shared/types.ts`、`src/client/store/app-store.ts` 初始 `llmConfig`）。
2. **运行时兼容**：对已落盘仍为 `opus-4.6` 的 Cursor 步骤，在 `tool-runner` / `command-runner` 中通过 `normalizeCursorModelForCLI` 视为未指定模型，从而使用 profile 的 `defaultModel`（`auto`），无需用户逐条改步骤。
3. **Shell 步骤成功时的 `error` 字段**：`exitCode === 0` 且 stderr 为空时，不再填入 `Command exited with code 0`，避免 Run Monitor 中误显示 `[STDERR]` 块（`command-runner.ts`）。

**部署注意**：修改后需重新 **`npm run build`** 并 **重启 Node 服务**，浏览器才会加载新静态资源；已保存在本地的 Planner 模型若仍为旧值，可在 **Settings → Planner Model** 中改为 `auto` 后失焦保存。

## 结论

- **API 冒烟**：通过。  
- **主要 UI 路径**：侧栏与 Header 核心按钮、模板/洞察/监控/流程图/保存/设置均已手点验证，无前端控制台报错。  
- **运行可靠性**：默认模型已修正；**完整调度 Run** 已通过 `npm run test:e2e-run` + 浏览器 Run 验证。多步 LLM 流水线仍依赖本机 CLI。

---
*本报告与当次构建及浏览器会话一致；重测时请更新日期与命令输出。*
