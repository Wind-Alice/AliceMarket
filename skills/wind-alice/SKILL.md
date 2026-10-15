---
name: wind-alice
description: 调用万得 Alice Agent（A2A 协议，SSE 流式）执行指定 Skill 并获取分析结果的 CLI 工具。当用户要求"用 Alice 跑某个 Skill"、"出一份某公司的调研问题清单"、"做一页纸投资备忘"、"核验一段金融信息"等需要点名 Alice 子 Skill 的场景使用。
---

# wind-alice

> 一个 CLI：把用户问题 + 指定的 **Alice Skill（中文或英文名均可）** 送到万得 Alice Agent 接口，按 SSE 流式拉取并打印 `agentResult.value`。

---

## 关键机制（必读）

实测：Alice 服务端**不是**通过 `selectedSkillIds` / `activatedSkills` 来选择 Skill 的，而是通过 **prompt 文本前缀**（按问句语言二选一）：

```text
问句含中文：使用「<中文 Skill 名>」技能：<原 prompt>
问句全英文：Using "<英文 Skill 名>" skill:<原 prompt>
```

同时把 `chatMode` 切到 `"12"`、`originalChatMode` 设为 `"4"`，且**不携带** `metadata.agentCard`。本 CLI 已在 `buildBody` 里封装这套行为；外部只需要传 `--skill "<Skill 名>"`。

因此：

- `--skill` **同时支持中文名和英文名**，不是 id。例如下列写法等价：
  - `--skill "上市公司调研问题清单"` （中文 nameZh）
  - `--skill "Stock DD List"` （英文 nameEn）
  - `--skill "stock-dd-list"` （英文模糊：忽略大小写/空格/`-_`）
  - `--skill "信用报告"` （口语别名，自动映射为「信用分析」）
- 命中后 CLI 会按问句语言拼前缀：问句含中文 -> `使用「nameZh」技能：`；问句全英文 -> `Using "nameEn" skill:`。
- **不要把产出物名称当成 Skill 名**：用户常说「信用报告」「一页纸」「财报点评」，但 portal 上的正式 Skill 名分别是「信用分析」「公司一页纸」「全球上市公司季报点评」。CLI 已内置常见口语别名映射；若仍出现 `[warn]`，请用 `list-skills` 核对正式名称。
- 未在 `KNOWN_SKILLS` 及别名表中的名称会以 `[warn]` 提示，但仍按字面值拼接前缀提交（portal 上新建/改名的 Skill 也能立刻使用）。

---

## 何时使用本技能

满足任一条件就用：

- 用户明确说："用 Alice 跑 / 调 / 执行 …"、"用 Wind 的 XX 技能跑 …"。
- 用户点名 Alice 的某个专业子 Skill（如「上市公司调研问题清单」「公司一页纸」「深度研究」「期权交易策略」「有色板块深度透视」等 36 项专业技能）。
- 用户的问题与某个 Skill 的能力高度匹配，且希望走专业链路而不是 auto 路由。

不要用本技能的场景：用户只是普通金融问答、不在意走哪个子 Skill - 让 Alice 自己 auto 路由即可（不传 `--skill`）。

---

## 已知支持的技能清单（共 36 项）

| 序号 | 中文技能名（`nameZh`） | 英文技能名（`nameEn`） | 常用别名（`aliases`） | 功能定位简述 |
|:---:|---|---|---|---|
| 1 | 通胀情景债券轮动策略 | Inflation Bond Strategy | 通胀配债, 债券轮动 | 追踪 CPI/PPI 通胀拐点，提供可空仓/久期轮动建议与策略回测 |
| 2 | 宏观数据解读 | Macro Data Interpretation | 宏观解读, 经济数据解读 | 解读 CPI/PPI/PMI/GDP/社融/利率等宏观数据周报式分析 |
| 3 | 按主题选股 | Thematic Stock Screening | 主题选股, 概念选股, 赛道选股 | 拆解市场交易主线与逻辑兑现度，筛出真正受益标的与估值建议 |
| 4 | 债券利率走势研判 | Bond Rate Outlook | 利率走势, 利率研判, 债券走势 | 交易/策略/配置多视角研判，结合量化评分与压力测试给出配置建议 |
| 5 | 信用分析 | Credit Analysis | 信用报告, 信用分析报告, credit report | 覆盖主体信用、行业风险、财务健康与 Wind 风险评分评级对标 |
| 6 | 基金对比分析 | Fund Compare | 基金对比, 基金对比分析报告 | 对多只基金全维度对比业绩、风险、持仓结构与管理评估 |
| 7 | 基金筛选与投资建议 | Fund Screening & Investment Advisory | 基金筛选, 基金建议, 选基金 | 多维度筛选基金并对比指标，输出个性化配置建议报告 |
| 8 | 投资标的创意与筛选 | Investment Idea Generation | 标的创意, 选股创意, 标的筛选 | 全市场量化因子与主题扫描，发掘逻辑/催化剂/风险明确的投资标的 |
| 9 | 公司一页纸 | Company One-Page Investment Memo | 一页纸, 投资备忘, one pager, one-pager | 上市公司一页纸投资报告（公司速览/逻辑/催化剂/估值/操作建议） |
| 10 | 上市公司调研问题清单 | Stock DD List | 调研问题清单, 调研清单, dd list | 买方视角调研问题清单（多空摘要 + 3-5 个深度议题针对性问题） |
| 11 | 全球上市公司季报点评 | Global Share Quarterly Earnings Review | 季报点评, 财报点评, earnings review | 卖方风格财报点评，覆盖 A/港/美/欧上市公司及业绩快报 |
| 12 | 市场规模测算与战略建模 | Market Sizing & Strategic Modeling | 市场规模, 市场空间测算, tam测算 | Top-down/Bottom-up 交叉验证，搭建可验证市场规模 Excel 模型与研报 |
| 13 | 可比公司分析 | Comps Analysis | 可比分析, comps, peer analysis | 机构级可比公司分析，输出 Excel 表格与估值倍数对比分析报告 |
| 14 | 事实核验 | Fact Check | 事实核查, 假消息核验, fact check | 逐点核查外部渠道金融数据、公司声明与事实真伪 |
| 15 | A股短线策略报告 | A-Share Short-Term Strategy Report | A股短线, 短线策略, 短线策略报告 | 每日收盘后复盘涨停股与资金轮动，输出 AI 主线研判结构化报告 |
| 16 | AI商品策略师 | AI Commodity Strategist | 商品策略师, 期货策略师, 期货盘前策略 | 覆盖能化/黑色/有色/农产/贵金属等板块，支持盘前/盘中/盘后策略输出 |
| 17 | 资产配置-行业轮动策略 | Asset Allocation - Sector Rotation Strategy | 行业轮动, 行业轮动策略, sector rotation | 分析未来 1-6 个月行业强弱，结合动量估值给出超配/低配目标权重 |
| 18 | 资产配置-战略基准组合 | Asset Allocation - Strategic Baseline Portfolio | 战略基准组合, 战略资产配置, saa | 制定 3-5 年战略资产配置基准，输出大类资产权重与指数映射 |
| 19 | 券商金股追踪 | Broker Top Picks Tracker | 券商金股, 金股追踪, 金股, top picks | 汇总月度券商金股推荐，统计热度排行、行业分布与共识主线 |
| 20 | 商品智研助手 | Commodity Research Assistant | 商品智研, 商品研报, commodity research | 输入品种名称或代码，生成基本面供需、远期曲线、资金与驱动逻辑研报 |
| 21 | 深度研究 | Deep Research | 深度调研, deep research | 复杂金融主题多阶段深度研究（澄清->界定->并行调研->交叉验证） |
| 22 | 基金涨跌解读 | Fund Performance Attribution Assistant | 基金涨跌, 基金业绩归因, 基金归因, 业绩归因 | 拆解基金/ETF 涨跌背后的持仓贡献、行业、事件驱动与宏观因素 |
| 23 | 期货资金流向监测 | Futures Fund Flow Monitor | 期货资金流, 期货资金流向, 资金流向监测 | 基于持仓额异动监测全市场资金流向，评估 T+1/T+5 价格表现 |
| 24 | 期货主力行为分析 | Futures Leading Institution Analysis | 期货主力, 主力行为分析, 主力席位 | 分析主力席位多空增减仓、净持仓、成交量排名与持仓集中度 |
| 25 | 期货研报观点 | Futures Research Opinion | 期货研报, 期货观点, 研报观点 | 聚合国内主流机构研报观点，输出多空观点分布与 Wind 情绪评分 |
| 26 | 机构持仓透视 | Institutional Holdings Insight | 机构持仓, 机构买卖, 主力持仓, 13f | 追踪顶级机构最新持股，输出建仓/清仓/增减持排序与调仓轨迹简报 |
| 27 | 期货盘中异动归因 | Intraday Futures Move Attribution | 期货盘中异动, 盘中异动, 期货异动归因 | 实时核验盘中量仓、板块联动与突发消息，解答品种为何拉升/跳水 |
| 28 | 金融监管局处罚月报 | NFRA Monthly Enforcement Report | 金融监管处罚, 处罚月报, 金监局处罚 | 按月汇总金融监管局对银行/保险/信托等机构的行政处罚与案由趋势 |
| 29 | 有色板块深度透视 | Nonferrous Metals Sector Deep Analysis | 有色金属分析, 有色金属, 有色金属行业深度分析 | 铜铝锌镍锡铅六大品种的供需平衡、产业链利润、库存与宏观定价研判 |
| 30 | 期权定价计算器 | Option Pricing Calculator | 期权定价, 期权计算器, 雪球定价 | 对香草、障碍、亚式、雪球/Autocall等期权做理论定价与希腊字母计算 |
| 31 | 期权波动率洞察 | Option Volatility Insights | 期权波动率, 波动率洞察, 波动率分析 | 诊断期权 IV 估值、期限结构、偏度（Skew）、PCR 与波动率曲面异动 |
| 32 | 期权交易策略 | Options Trading Strategies | 期权交易策略, 期权策略, 期权组合 | 融合波动率与方向性研判，推荐价差、跨式、备兑等组合方案与损益图 |
| 33 | 幻灯片 | PPT Generator | 生成ppt, 制作ppt, ppt生成器, slides | 根据金融投研主题或提纲自动生成专业排版的 PPT 报告 |
| 34 | 贵金属板块深度透视 | Precious Metals Sector Deep Dive | 贵金属分析, 贵金属, 黄金白银, 贵金属行业深度剖析 | 覆盖金、银、铂、钯四大品种的行情复盘、金银比、资金与租赁利率分析 |
| 35 | 证券业监管政策简报 | Securities Regulatory Policy Briefing | 证券监管简报, 监管政策简报, 证券业监管政策 | 获取证监会及交易所最新监管政策法规，输出核心要点摘要与清单 |
| 36 | 股票交易策略 | Stock Trading Strategy | 股票交易策略分析, 股票策略, 个股交易策略, 持仓策略 | 覆盖持仓盈亏、基本面估值、技术量化、行业生态与执行风控的个股策略 |

---

## 调用方式（Agent 工作流）

1. 拿到用户问题 -> 决定 Skill：
   - 用户点名 Skill -> 直接传该 Skill 的**中文名或英文名**到 `--skill`（脚本会自动归一化并回填英文名）；用户说「信用报告」等口语时传 `--skill "信用报告"` 亦可，CLI 会映射为「信用分析」；
   - 用户没点名但问题明显属于某 Skill（如「核查事实」「公司调研问题清单」「财报点评」）-> 可建议并征询后再指定；
   - 否则不传 `--skill`，走 auto。
   - **禁止改写用户问句**：把用户的**原话**作为 `--prompt` 传入即可（如 `Can I get a one-pager for [300498]?` 原样传入），不要"帮用户组织语言"、不要只提取股票代码、不要翻译或重写。CLI 会在前缀里自动拼接 Skill 标识（如 `Using "Company One-Page Investment Memo" skill:`），用户问句本身必须保持原样。
2. **发起调用前**用一句话告知用户：Alice 专业 Skill 耗时常为 **数分钟到十几分钟**（复杂研报、一页纸、可比分析等更久），且可能消耗较多积分；属正常现象，请耐心等待，**不要中途取消命令或重复发起相同请求**。
3. **先定位本 skill 目录**：下面命令里的 `scripts/wind-alice.mjs` 是相对当前 `SKILL.md` 所在的 `wind-alice` 目录。若当前工作目录不是该目录，先 `cd` 到该目录再执行。
4. 执行（任一种写法都可以）：

```bash
node scripts/wind-alice.mjs --prompt "<USER_QUESTION>" --skill "<中文 Skill 名>"
node scripts/wind-alice.mjs --prompt "<USER_QUESTION>" --skill "<英文 Skill 名>"
```

5. 等流式输出结束后，按下方 [交付给用户](#交付给用户) 规则输出；等待期间若终端长时间无新输出，仍应继续等至进程退出，勿误判为卡死。

> 也可以先列已知 Skill 给用户挑：
>
> ```bash
> node scripts/wind-alice.mjs list-skills
> ```

---

## 一次性配置

1. Node.js 18+（自带 `fetch`）。
2. 配置 **WIND_API_KEY**：
   - 优先级：`%USERPROFILE%\.wind-aifinmarket\config.env` 或 `config`（dotenv：`WIND_API_KEY=...`）> 本 skill 目录 `config.json`（`{"wind_api_key":"..."}`）> `WIND_API_KEY` 环境变量。
   - 不得手动检查部分来源后判定缺 Key。必须直接执行 CLI；只有 CLI 返回 `KEY_MISSING`，才能判定全部来源均未提供有效 Key。
   - Key 获取入口：<https://market.windalice.com/#/user/overview>（或 <https://aifinmarket.wind.com.cn/#/user/overview>），积分充值入口：<https://market.windalice.com/#/user/credits>。
3. 可选：`WIND_ALICE_API_URL` 覆盖默认接口地址。

---

## 安全要求

- 绝不要输出真实 `WIND_API_KEY`、Bearer token、`config.json` 内容或 `%USERPROFILE%\.wind-aifinmarket\config.env`（或 `config`）内容。
- 若需要说明下载方式，只展示 `Authorization: Bearer <WIND_API_KEY>` 这种占位格式；不要拼出含真实 Key 的 curl、PowerShell 或 HTTP 示例。
- Alice 返回的报告 URL 可以在当前用户会话中用于交付和下载；写入 README、示例、工单、提交信息等长期材料时使用占位 URL。

---

## 文件下载处理

许多 Skill（公司一页纸 / 调研问题清单 / 季报点评 / 市场规模测算 / 可比公司分析 等）会产出可下载的报告 / 数据附件。

CLI 在每次调用结束时**直接用 `WIND_API_KEY` 作 Bearer Token 把附件下载到 `.agents/download/` 目录**，并把下载结果（已保存路径或失败原因）打到 **stderr**。

**附件清单有两个来源，优先级如下**：

1. **服务端 `A2A.PresentFiles` 声明（权威）**：SSE 的 artifact 里带 `componentName: "A2A.PresentFiles"` 组件时，
   以它列出的文件为准——服务端明确说了本次要呈现哪些文件，不多不少。
2. **`agentResult.value` 正文链接扫描（兜底）**：仅当整轮 SSE **一个 PresentFiles 组件都没有**时才启用，
   靠正则从正文里抓 markdown 链接 / 裸 URL / `/project/xxx.ext` 路径。

CLI 会在下载前把判定过程打到 stderr，附件没下来时看这几行即可定位：

```text
[下载] A2A.PresentFiles 诊断：命中 1 个组件，列出 2 个文件：报告.md, 财务模型.xlsx
[下载] 清单来源：服务端 A2A.PresentFiles 声明（2 个文件）
=== 检测到 2 个可下载文件，正在下载到：<目标目录> ===
- <文件名>
  已保存：<目标目录>\<文件名>
```

若诊断行显示「命中 N 个组件，但未解析出文件叶子」，stderr 会 dump 组件原始结构（每条最多 4000 字符）供排查。

**下载目录解析规则（按优先级）**：

1. **用户级**：若本 skill 安装在 `%USERPROFILE%\.agents`（POSIX 下为 `~/.agents`）之下（典型如 `~/.agents/skills/wind-alice`），下载到 `%USERPROFILE%\.agents\download\`。
2. **项目级**：否则从 skill 所在目录沿目录向上查找最近的、含有 `.agents/` 子目录的祖先目录 `P`，下载到 `P\.agents\download\`（典型如 `<项目根>\.agents\download\`）。
3. **兜底（用户级）**：上述都未命中（例如 skill 处于 SVN/Git 源码开发目录、且没人建过项目级 `.agents`），**统一兜底到用户级 `%USERPROFILE%\.agents\download\`**--即与规则 1 同一物理目录。CLI **不会**再把文件散落到 `process.cwd()`。

无论命中哪一条，目录不存在时 CLI 都会按 recursive 方式自动创建，无需用户手工 `mkdir`；只有当 mkdir 因权限/磁盘等原因失败时，才会作为最终兜底退回 `process.cwd()`，并在 stderr 打 `[warn]` 提示。

记忆点：**所有 Alice 下载的文件，要么在某个 `<...>/.agents/download/` 下，要么在 `~/.agents/download/` 下**，可以稳定地"按目录找文件"。

**重要事实**：

1. 文件接口与 Agent 接口 **共用同一份 `WIND_API_KEY`**（即万得 AIFin Market 提供的 apiKey），CLI 内部自带 `Authorization: Bearer <WIND_API_KEY>` 走 HTTP GET 下载。
2. 同名文件冲突会自动追加 ` (1)`、` (2)` 等后缀，不会覆盖已有文件。
3. CLI **不会把 Key 打印到日志**；下载结果只出现在 stderr，不会污染 stdout 的 `agentResult.value` 主体。
4. 下载失败（401 / 403 / 网络异常等）只会打印失败原因 + 原始 URL，不影响主流程退出码。

调用结束后无需再向用户解释"如何下载"；本地下载路径已由 CLI **内联到 stdout 正文**中（原文里文件出现在哪，路径就填在哪），不需要在回复末尾再追加提示；只有当 CLI stderr 报"下载失败"时才需要把 URL 与失败原因转告用户排查。

---

## 交付给用户

> 交付契约：**正文用 `agentResult.value`，附件路径已内联在正文中，禁止读附件展示。**

### 正确流程

1. 从 CLI stdout 提取 `agentResult.value:` 后的正文（去掉行首前缀），**原样**呈现给用户；
2. CLI 已自动把正文中不可点击的 `/project/...` 附件引用**就地替换**为本地下载路径（如 `D:\...\.agents\download\xxx.md`），并过滤 `### …完整报告` 标题--**不要**再向用户复述服务端工作区路径；
3. **禁止**自行添加开场白（如「以下为 XX 的一页纸投资报告」「由 Wind Alice 技能生成」等）——会与正文标题重复；
4. **禁止**标注「agentResult.value（原文）」等内部字段名；
5. **禁止概括、摘要、改写** `agentResult.value` 正文（不要把报告浓缩成表格或自行重述要点）；
6. **不要**在回复末尾再追加「已保存到：…」之类的附件路径提示--本地路径已在正文中内联展示；
7. **禁止**用 Read / view_files 加载 `.agents/download/` 下附件正文展示给用户——`agentResult.value` 已是面向用户的核心分析摘要，完整 Markdown 附件供用户本地打开查阅。

### 禁止写法

| ❌ 错误 | ✅ 正确 |
|--------|--------|
| 开头写「完整 Markdown 已保存至：…」 | 正文先交付 `agentResult.value`，路径已内联在正文中 |
| 再复述「文件保存在：`/project/...`」 | CLI 已替换为本地路径；不要再向用户复述服务端路径 |
| 在末尾追加「已保存到：`D:...`」 | 路径已在正文中内联展示，无需末尾再追加 |
| 写「agentResult.value（原文）：」 | 直接输出正文，不加内部标签 |
| 写「以下为 … 一页纸投资报告（由 XX 技能生成）」 | 直接输出正文（正文里通常已有标题） |
| Read 下载的 `.md` 全文贴给用户 | 只交付 stdout 摘要（含已内联的附件路径） |

### stdout 被截断时

若宿主终端截断 stdout，**仍只读 `agentResult.value` 落盘副本**（若 CLI 提供）；**不要**改读 `.agents/download/` 附件替代交付正文。附件路径已内联在正文中，无需额外处理。

---

## 硬性要求

1. **PowerShell 下读取本文档必须显式使用 UTF-8**：例如 `Get-Content -Encoding UTF8 skills\wind-alice\SKILL.md`；若看到中文乱码，先按 UTF-8 重新读取，不能基于乱码内容执行。
2. **`--skill` 接受中文或英文 Skill 名，及常见口语别名**（与 `KNOWN_SKILLS` / portal 一致）。脚本会按 nameEn -> nameZh -> normalize(nameEn) -> normalize(nameZh) -> 别名表 顺序匹配；命中后按问句语言拼前缀（中文问句用 nameZh，全英文问句用 nameEn）。**`--prompt` 里可以说「信用报告」，但 `--skill` 应传「信用分析」或别名「信用报告」**；不确定时先 `list-skills`。
3. **Prompt 必须非空**：空白或缺失时直接退出码 2，不发请求。
4. **不得把 Key 打印到日志**：脚本仅在 `Authorization` 头里使用，不会输出到 stdout/stderr。
5. **流式必须等到结束**：CLI 已在父子进程间 `await` 子进程退出；切勿改成"发完即返"。
6. **耗时预期与耐心提示**：调用前须提醒用户 Alice Skill 可能较慢；执行中不得因等待过久而中断 CLI、改走其它工具或并行重复调用同一任务。
7. **不要凭空构造 `selectedSkillIds` / `agentCard` 之类的旧字段去指定 Skill** - 已实测不生效，必须走文本前缀。
8. **禁止改写用户问句**：`--prompt` 必须是用户的**原话**，不得"帮用户组织语言"、只提取关键词、翻译或重写。例如用户问 `Can I get a one-pager for [300498]?`，就必须传 `--prompt "Can I get a one-pager for [300498]?"`，不得改写为 `--prompt "300498"`。CLI 会自动在前面拼接 Skill 标识前缀（如 `Using "Company One-Page Investment Memo" skill:`），用户问句本身必须原样透传，服务端才能收到完整的原始问题。
9. **服务端拒绝受理时按退出码 75 处理，禁止自行重试**：服务端会以 HTTP 200 +
   `result.isError` 返回拒绝原因（**不是** JSON-RPC 的 `error` 字段）。CLI 命中后会把
   服务端原文打到 stderr，并输出 `ALICE_BLOCKED_REASON=<points|quota|concurrency|busy>`
   和 `[严重]` 指引，退出码 **75**（临时性失败，非 CLI 故障）。
   - `points`（积分不足）：**充值前重试一律无效**。禁止立即重试、禁止换 prompt、禁止换
     `--skill`；必须引导用户前往 <https://market.windalice.com/#/user/credits> 充值，
     充值后由**用户重新发问**。禁止说"稍后重试"或"等任务跑完"——那是 busy / concurrency 的话术。
   - `quota`：稍后或次日再试，或更换 API Key。
   - `concurrency`：等该账号下已在执行的任务跑完，再用**相同 prompt** 重试。
   - `busy`：等几分钟后用相同 prompt 再试，不要连续重试。
   - 认不出的拒绝文案退出码为 1，CLI 仍会原样打出服务端原文，转告用户即可。
   - **禁止**把退出码 75 当成 CLI 故障去排查 Key、网络或改参数重跑。
10. **交付 gentResult.value 正文（附件路径已内联）**：正文必须来自 stdout 的 gentResult.value（CLI 已把 /project/ 附件引用就地替换为本地下载路径），禁止概括、摘要、改写；**不要**在回复末尾再追加附件路径提示（路径已内联在正文中）；**禁止**读取 .agents/download/ 附件内容展示给用户。

## 更新检查处理

每次有效调用 `wind-alice.mjs` 结束后，脚本会静默触发后台更新检查：

- 只记录当前 skill 刚被使用，并后台启动 `scripts/update-check.mjs`，不阻塞 Alice 主请求收尾。
- 后台检查会等待短暂 quiet window，避免 skill 正在使用时被更新覆盖。
- 按安装范围读取 lock，检查远端 HEAD，每日成功态去重；Gitee 源或 `skills update` 未落盘时改用 `npx skills add ... --skill wind-alice` 重装。
- 更新失败、网络不通或无更新时均不输出内容，也不影响本次 Alice 调用。
