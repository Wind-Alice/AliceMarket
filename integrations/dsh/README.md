# DeepSeek Harness（DSH）集成

把 Wind 的金融数据与分析方法接进 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）。
本目录是一个 **DSH profile bundle**（纯配置，无 JS 代码）+ 一套契约测试。

## 为什么不能把本仓库"作为插件"装进 DSH

AliceMarket 是 **Skill 集合仓库**，不是 DSH 插件包：

- 仓库根目录没有 `package.json`，也就没有 DSH 要求的 `dsh.bundle.patch` 清单。用插件管理器安装时，
  pnpm 只能生成一个占位 `package.json`，DSH Loader 找不到任何可挂载的行 —— 装完什么都不会发生。
- 它也不是 MCP server，而是 MCP **客户端**：`skills/wind-mcp-skill/scripts/cli.mjs` 用
  `Authorization: Bearer <WIND_API_KEY>` 调用 Wind 的 7 个远端 streamable-HTTP MCP 端点。

DSH 支持 MCP 的正规方式，是用 DSH 自带的 `@deepseek-ai/dsh-mcp-client`，通过一个 bundle 把它的行
插进当前 profile。本目录就是这个 bundle。

## 方案总览

| 需求 | 做法 | 原因 |
| --- | --- | --- |
| 取数（行情 / 财务 / 公告 / 宏观 …） | 本 bundle 挂载的 MCP 原生工具 | 确定性调用，工具名稳定（`mcp__wind_<域>__<tool>`），可被权限与会话历史引用 |
| `wind-mcp-skill` | **不装** | 它就是同一批端点的 CLI 包装；再装会形成两条取数路径并叠加一份硬路由守则 |
| 分析方法论（估值 / 回测 / 财报点评 …） | 按 [`recommended-skills.json`](./recommended-skills.json) 精选安装 | 这类是带 `references/`、`scripts/` 的流程资产，是真正的增量 |

## 安装

前置：DSH 已装好并能正常启动；`pnpm` 可用。

```bash
# 1) 把本目录克隆到本地任意位置（DSH 通过路径链接安装，不发布到 npm）
git clone https://github.com/Wind-Alice/AliceMarket.git
```

然后在 DSH 会话里让 Agent 执行（`target` 用绝对路径）：

```text
plugin_manager(action: "install_bundle", target: "/绝对路径/AliceMarket/integrations/dsh")
```

安装成功后：

- `list_bundles` 里出现 `@local/wind-mcp`；
- profile 的 `package.json` 会写入 `link:` 依赖与 `dsh.profile.bundles` 条目（由 DSH 自己维护，不要手改）；
- 「设置 → 插件」里能看到 **Wind 万得金融数据 MCP**。

从 GitHub 直接安装（本仓库尚不发布 npm 包）等价于：

```bash
cd /tmp && git clone --depth 1 https://github.com/Wind-Alice/AliceMarket.git
# 再对 /tmp/AliceMarket/integrations/dsh 调用 install_bundle
```

## 配置 API Key

Key 的取值顺序（由 `cordis.patch.yml` 里的 `!!js` 表达式在行激活时求值）：

1. 环境变量 `WIND_API_KEY`
2. `~/.wind-aifinmarket/config` 中的 `WIND_API_KEY=...`

推荐用与 `wind-mcp-skill` 完全相同的全局配置，一份 Key 全仓库共享：

```bash
mkdir -p ~/.wind-aifinmarket && echo "WIND_API_KEY=ak_你的key" > ~/.wind-aifinmarket/config
chmod 600 ~/.wind-aifinmarket/config
```

先自检 Key 是否可用（期望输出 `200`）：

```bash
KEY=$(sed -n 's/^WIND_API_KEY=//p' ~/.wind-aifinmarket/config)
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  'https://mcp.wind.com.cn/vserver_stock_data/mcp/' \
  -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"dsh-check","version":"1.0"}}}'
```

`!!js` 只在行激活时求值，所以**改完 Key 需要重新激活**：重启 DSH，或在「设置 → 插件」里把
`@local/wind-mcp` 关掉再打开。

## 工具与裁剪

工具名形如 `mcp__wind_stock__get_stock_price_indicators`、`mcp__wind_docs__get_financial_news`。
全量 7 个域约 35 个工具，工具定义会进入每次请求的上下文前缀，**按需裁剪**：

| serverName | 端点 | 覆盖 | 建议 |
| --- | --- | --- | --- |
| `wind_stock` | `vserver_stock_data` | 股票筛选、行情、K线、档案、财务、股东、事件、技术、风险 | 保留 |
| `wind_docs` | `vserver_financial_docs` | 公告、年报、季报、招股书、财经新闻 | 保留 |
| `wind_economic` | `vserver_economic_data` | 宏观 / 行业 / 汇率 EDB 指标 | 保留 |
| `wind_fund` | `vserver_fund_data` | 基金 / ETF 筛选、行情、持仓、业绩 | 按需 |
| `wind_index` | `vserver_index_data` | 指数 / 板块 行情、基本面、技术 | 按需 |
| `wind_bond` | `vserver_bond_data` | 债券档案、发债主体、行情估值 | 按需 |
| `wind_analytics` | `vserver_analytics_data` | 跨标的聚合、加权、排名 | 按需（专项工具无法覆盖时才用） |

删掉 `cordis.patch.yml` 里对应的 `- id: wind-mcp-*` 段即可；每段相互独立，删完仍是合法的 patch
（`test/bundle.test.mjs` 覆盖了这一点）。

## 安装精选 skill（可选）

DSH 的本地 skill 目录是 `~/.dsh/skills/<name>/SKILL.md`（或项目根 `.dsh/skills/`），需要同时启用
`@deepseek-ai/dsh-skill-filesystem` 这一行。只装 `recommended-skills.json` 里列的 5 个：

```bash
mkdir -p ~/.dsh/skills
for s in dcf-model backtest-expert earnings-analysis market-environment-analysis position-sizer; do
  cp -R "skills/$s" ~/.dsh/skills/
done
```

想让某个 skill 只由人手动触发、不进入模型可见的 skill 目录，在它的 frontmatter 里加
`disable-model-invocation: true`。

## 测试

契约测试用 Node 内置 test runner，无需 DSH 安装即可运行：

```bash
cd integrations/dsh
npm install
npm test
```

测试内容：

- **方言**：用 DSH 自己的解析方式（`js-yaml` + `JSON_SCHEMA.extend(JsExpr)`）解析 patch；
- **行契约**：`serverName` 合法且唯一、`transport`/`url`/超时/失败策略类型正确；
- **凭据**：`Authorization` 必须是 `!!js` 表达式、文件里不得出现明文 Key；表达式在
  「环境变量 / 配置文件 / 都没有」三种情况下的取值语义；
- **端点一致性**：与 `skills/wind-mcp-skill/scripts/cli.mjs` 的 `SERVERS` 表逐条比对，防止端点漂移；
- **工具面一致性**：DSH 公开工具名符合 `mcp__<serverName>__<tool>` 约定，且 `tool-manifest.json` 覆盖的域与 bundle 一致；
- **裁剪**：删到只剩单个域时契约仍然成立；
- **线上验证**（可选，设置 `WIND_API_KEY` 后启用）：
  1. 7 个端点各做一次 `initialize` 握手，断言 HTTP 200；
  2. 对每个端点 `tools/list`，与 `scripts/tool-manifest.json` 逐条比对（当前 35 个工具）；
  3. `wind_stock` 上真实 `tools/call` 取一次行情（贵州茅台），断言返回非空且含标的代码。
  未设置 `WIND_API_KEY` 时这 3 条自动跳过，离线契约测试照常全绿。

## 验证状态（实测记录）

在 DeepSeek Harness 桌面版（profile `desktop`）与真实 Wind 账号下实测：

| 项目 | 结果 |
| --- | --- |
| `npm test`（有 Key） | 33 passed / 0 failed / 0 skipped |
| `npm test`（无 Key） | 30 passed / 0 failed / 3 skipped |
| `initialize` × 7 端点 | 全部 HTTP 200，`serverInfo.name = wind-mcp-streamable-http-stateless` |
| `tools/list` × 7 端点 | 与 `tool-manifest.json` 完全一致（35 个工具） |
| 真实取数 | `get_stock_price_indicators(600519.SH)` → 贵州茅台 1283.19 元 / +1.60% |
| DSH 装载 | `install_bundle` → `application: applied`，7 行 `fiberPhase: active` |
| DSH 工具注册 | 运行时工具表出现全部 35 个 `mcp__wind_*` 工具 |

> 上表为撰写本 PR 时的实测快照；Wind 侧工具或行情会变，测试以 `tool-manifest.json` 为断言基准。


## 排错

| 现象 | 原因 / 处理 |
| --- | --- |
| 工具列表里没有 `mcp__wind_*` | 连接没建立。先跑上面的 curl 自检；401/403 说明 Key 缺失或无效 |
| `mcp-client(wind_stock): server is disconnected` | 同上；无 Key 时就是这个状态，harness 仍正常启动 |
| 装了 bundle 但 `list_bundles` 没有条目 | `target` 传成了仓库根目录。必须指向含 `dsh.bundle.patch` 的目录，即 `integrations/dsh` |
| 想让连接失败直接报错 | 把对应行的 `failOnStartupError` 改成 `true` |
| 改完 Key 没生效 | `!!js` 只在行激活时求值，需重启 DSH 或重新启用该 bundle |

## 卸载

```text
plugin_manager(action: "remove_bundle", target: "@local/wind-mcp")
```

## 对其它 Agent 无影响

Claude Code / Claude Desktop / OpenClaw / Hermes 等继续按根 [README](../README.md) 的方式用
`npx skills add` 装 skill；本目录只新增 DSH 的接入方式，不改动任何现有 `SKILL.md`。
