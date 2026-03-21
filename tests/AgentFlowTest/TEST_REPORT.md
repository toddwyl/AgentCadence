# AgentFlow 测试报告 (AgentFlowTest)

## 测试环境

- 项目路径: `AgentFlow`
- 构建: `npm run build` — **通过** (tsc + vite)
- API 冒烟: `node scripts/agentflow-smoke.mjs` — 需在 **后端已启动** 时执行（默认 `http://localhost:3712`）

## 本次需求验证

| 项目 | 说明 |
|------|------|
| 新建 Pipeline 可选模板 | Sidebar「新建 Pipeline」表单单增「从模板创建」下拉；选模板后调用 `POST /templates/:id/create-pipeline`，支持 `name` 覆盖 |
| 演示/默认工具为 Cursor | `POST /pipelines/:id/demo` 四步均为 `tool: cursor`；新建步骤默认 `cursor` |
| 工作目录浏览 | `POST /api/fs/pick-folder` 在 **运行服务器的本机** 弹出系统文件夹选择器；Header / 新建表单 / AI 生成 / 模板使用处均有「浏览…」按钮 |

### 文件夹选择器说明

- 对话框由 **Node 服务端** 调用系统命令打开，仅在 **本机访问** AgentFlow 且浏览器与后端同机时可用。
- macOS: `osascript`；Windows: PowerShell `FolderBrowserDialog`；Linux: `zenity` 或 `kdialog`。

## 自动化冒烟脚本结果

在运行 `npm run dev` 或 `npm start` 后执行：

```bash
cd AgentFlow
node scripts/agentflow-smoke.mjs
```

脚本会校验：`GET /pipelines`、`GET /fs/home`、创建空 Pipeline、列出模板、（若有模板）从模板创建、加载 demo 并检查步骤工具均为 `cursor`。

**最近一次在本仓库执行结果示例（7/7 通过）：**

```json
{
  "base": "http://localhost:3712",
  "passed": 7,
  "failed": 0,
  "results": [
    { "name": "GET /pipelines", "pass": true },
    { "name": "GET /fs/home", "pass": true },
    { "name": "POST /pipelines (empty)", "pass": true },
    { "name": "GET /templates", "pass": true },
    { "name": "POST /templates/:id/create-pipeline", "pass": true },
    { "name": "POST /pipelines/:id/demo (cursor tools)", "pass": true },
    { "name": "Demo steps use cursor", "pass": true, "detail": "cursor,cursor,cursor,cursor" }
  ]
}
```

## 手动回归（重试 / 执行连续性）

以下建议在本地 UI (`http://localhost:5173`) 执行：

1. **阶段顺序**: 多阶段 Pipeline 应 **上一阶段全部完成** 后再进入下一阶段（此前已修复 `resolveAllSteps` 阶段依赖）。
2. **重试**: 步骤设为「重试该步骤」、次数 3；故意让某步失败，应最多尝试 3 次后失败；WebSocket `step_retry` 应实时更新「已失败 X 轮 / 最多共 Y 次」。
3. **失败后 Pipeline**: 非「跳过」模式下失败应中止后续步骤为 skipped。
4. **运行中编辑**: 运行中 Header 工作目录输入与浏览应禁用（当前实现）。
5. **运行监控 / 历史**: Header「运行监控」打开监控页；**运行** 为实时或最近一次快照，**历史** 列出已保存的多次运行；点击步骤查看输出（新运行会在服务端把每步输出写入 `runHistory`）。

## 已知限制

- 完整「运行」依赖本机已安装 `cursor-agent` / `claude` 等 CLI 及有效模型；无模型时可能长时间挂起或超时，不属于前端逻辑 bug。
- 冒烟脚本 **不** 自动点击「浏览」或执行真实 CLI。

## 已修复问题备忘（阶段 / 步骤命名）

- **不再使用 S1、S2 作为阶段前缀**：编排编辑里阶段行仅显示顺序数字 `1、2…` 与阶段名称；新建阶段 / 步骤在未填写名称时使用 i18n 默认「阶段」/「步骤」（英文 UI 为 Phase / Step），与后端默认一致。
- **模板 Markdown**：`src/shared/pipeline-markdown.ts` 统一解析/生成格式；模板导出含 **Depends On**，导入走同一解析逻辑。

## 已修复问题备忘（运行白屏 / Unknown）

- **运行后空白页**：若步骤 `tool` 字段缺失或非法，`TOOL_META[step]` 为 `undefined`，访问 `meta.tintColor` 会抛错导致整页白屏。已用 `safeToolMeta()` 兜底。
- **工作目录以 `/` 结尾显示 Unknown**：`path.split('/').pop()` 在尾部斜杠时得到空串。已改为去尾部分隔符后再取最后一段目录名。
- **勿在 `src/shared/` 提交 `types.js`**：会与 `types.ts` 冲突导致构建使用旧导出；已加入 `.gitignore`。

---
*报告随版本更新；最后一次更新与实现同步生成。*
