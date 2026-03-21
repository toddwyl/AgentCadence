# AgentFlow

基于 TypeScript 的 **Web 端通用 CLI 编排工作台**，对应桌面端项目 [AgentCrew](https://github.com/qingni/AgentCrew) 的能力迁移（Pipeline 编排、DAG 调度、AI 规划、多工具执行等）。

## 环境要求

- Node.js 18+
- 本机已按需安装 `cursor-agent` / `claude` / Codex 等 CLI（执行步骤时由服务端调用）

## 安装与开发

```bash
npm install
npm run dev
```

- 前端开发服务器：默认 `http://localhost:5173`（Vite）
- API 与静态资源：默认 `http://localhost:3712`（`PORT` 可改）

生产构建后，仅启动 Node 即可同时提供 API 与打包后的前端：

```bash
npm run build
npm start
```

浏览器访问 `http://localhost:3712`（或你配置的 `PORT`）。

## 环境变量

| 变量 | 说明 |
|------|------|
| `PORT` | HTTP 端口，默认 `3712` |

## 自动化冒烟

先启动后端（`npm run dev` 或 `npm start`），再执行：

```bash
npm run test:smoke
```

详见 `tests/AgentFlowTest/TEST_REPORT.md`。
