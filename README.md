# Wind AliceMarket

> **Wind AliceMarket · 万得金融 Skill 市场** · 通过 MCP 协议把万得金融数据接入 AI Agent，一站式收录万得官方数据能力 + 社区金融分析工作流

[![GitHub](https://img.shields.io/badge/GitHub-Wind--Alice%2FAliceMarket-blue?logo=github)](https://github.com/Wind-Alice/AliceMarket)

---

## 📦 收录的 Skill

### 技能发现类

| Skill | 能力域 |
| --- | --- |
| [`wind-find-finance-skill`](./skills/wind-find-finance-skill) | **金融能力入口**：列举平台所有 skill 并按用户问题推荐，引导安装 / 升级 |

### 数据获取类

| Skill | 能力域 |
| --- | --- |
| [`wind-mcp-skill`](./skills/wind-mcp-skill) | **访问万得 Wind 金融数据**：股票、基金、指数/板块、债券、期货、期权、企业风控、宏观 EDB、公告新闻研报，11 个 MCP server / 140+ 工具 |
| [`tushare-finance-skill`](./skills/tushare-finance-skill) | **访问 Tushare Pro 金融数据**：A 股、港股、美股、基金、期货、债券、财务报表与宏观经济指标 |

### Agent 类

| Skill | 能力域 |
| --- | --- |
| [`wind-alice`](./skills/wind-alice) | **万得 Alice Agent 入口**：A2A 协议 + SSE 流式，跑 Alice 子 Skill（公司一页纸 / 财报点评 / 主题选股 / 基金分析 / 宏观债券信用分析等）做综合金融分析 |

### 金融技能类

| Skill | 一句话 |
| --- | --- |
| [`a-share-primary-theme-identification`](./skills/a-share-primary-theme-identification) | 用于A股市场主线识别，聚焦市场结构 / 题材周期 / 资金行为 |
| [`add_to_winner_decision_skill`](./skills/add_to_winner_decision_skill) | 判断盈利仓是否适合继续加仓，并给出加仓前提、节奏安排、保护规则与停止扩张边界 |
| [`after_close_watchlist_recap_skill`](./skills/after_close_watchlist_recap_skill) | 在收盘后总结自选股当日表现、驱动因素、强弱分化与次日观察点 |
| [`avatar-charlie-munger-thinking`](./skills/avatar-charlie-munger-thinking) | 使用查理·芒格式的逆向思考、激励分析、认知偏误叠加和多学科模型检验复杂决策 |
| [`avatar-nassim-taleb-risk`](./skills/avatar-nassim-taleb-risk) | 使用纳西姆·塔勒布式的尾部风险、利益共担、减法、林迪效应和杠铃策略分析不确定性 |
| [`avatar-naval-ravikant-thinking`](./skills/avatar-naval-ravikant-thinking) | 使用纳瓦尔·拉维坎特式的重新定义、欲望审计、特定知识和杠杆框架澄清职业、创业、财富、幸福、自由与人生选择 |
| [`avatar-warren-buffett-investing`](./skills/avatar-warren-buffett-investing) | 使用沃伦·巴菲特式的能力圈、护城河、管理层诚信、所有者收益和资本配置框架分析企业与长期投资 |
| [`backtest-expert`](./skills/backtest-expert) | Expert guidance for systematic backtesting of trading s… |
| [`breakout_candidate_finder_skill`](./skills/breakout_candidate_finder_skill) | 批量识别突破形态成熟、量价结构健康、催化配合较好的候选股，并输出优先级、触发条件与失效边界 |
| [`breakout_trade_execution_skill`](./skills/breakout_trade_execution_skill) | 围绕突破交易制定从观察、触发、跟进到失效处理的落地执行方案，兼顾量价确认、环境配合与失败撤退 |
| [`bull_bear_case_builder_skill`](./skills/bull_bear_case_builder_skill) | 同时搭建看多与看空逻辑，比较证据强弱、关键变量与情景路径，帮助识别核心分歧 |
| [`business_model_decoder_skill`](./skills/business_model_decoder_skill) | 把公司如何获客、交付、定价、赚钱和扩张的逻辑拆解清楚，帮助快速理解业务运转方式 |
| [`buyback_program_reviewer_skill`](./skills/buyback_program_reviewer_skill) | 判断回购计划的规模、动机、执行约束与真实利好程度 |
| [`canslim_growth_scan_skill`](./skills/canslim_growth_scan_skill) | 依据成长股框架批量筛选业绩、预期、相对强度与供需结构共振的强势标的，并输出候选分层与跟踪重点 |
| [`conference_call_takeaway_skill`](./skills/conference_call_takeaway_skill) | 提炼业绩会中的新信息、管理层语气变化、问答焦点与潜在警讯 |
| [`daily_watchlist_morning_brief_skill`](./skills/daily_watchlist_morning_brief_skill) | 为自选股生成盘前简报，汇总隔夜公告、新闻、价格变化、事件日程与今日观察重点 |
| [`dcf-model`](./skills/dcf-model) | Real DCF (Discounted Cash Flow) model creation for equi… |
| [`dip_buy_decision_skill`](./skills/dip_buy_decision_skill) | 判断下跌或回调中的个股是否值得承接，并给出观察区、试错条件、分批节奏与放弃标准 |
| [`dividend_change_explainer_skill`](./skills/dividend_change_explainer_skill) | 解读分红提升、削减、暂停或恢复背后的原因、持续性与投资含义 |
| [`dividend_growth_entry_skill`](./skills/dividend_growth_entry_skill) | 寻找股息持续增长、经营质量稳定且估值回落到合理区间的候选股，并输出入场观察区、成长支撑与失效边界 |
| [`earnings-analysis`](./skills/earnings-analysis) | Create professional equity research earnings update rep… |
| [`earnings_calendar_planner_skill`](./skills/earnings_calendar_planner_skill) | 按时间轴组织财报季中的重点公司、前后任务、优先级与提醒 |
| [`earnings_momentum_setup_skill`](./skills/earnings_momentum_setup_skill) | 寻找财报发布后业绩与指引共同强化、量价表现积极、具备继续上行动能的机会股，并输出跟踪优先级、延续条件与失效边界 |
| [`earnings_preview_skill`](./skills/earnings_preview_skill) | 财报前梳理市场预期、关键看点、验证指标、情景推演与风险点 |
| [`earnings_reaction_interpreter_skill`](./skills/earnings_reaction_interpreter_skill) | 解读财报发布后的涨跌反应、超预期来源、市场真实分歧与后续观察点 |
| [`equity-investment-thesis`](./skills/equity-investment-thesis) | 用于个股核心投资逻辑深度研究，聚焦个股研究 / 基本面分析 / 机构研究 |
| [`failed_breakout_exit_skill`](./skills/failed_breakout_exit_skill) | 识别突破失败、冲高回落与关键位失守后的撤退信号，并给出减仓、止损与重新观察的动作顺序 |
| [`gap_open_interpreter_skill`](./skills/gap_open_interpreter_skill) | 解读高开、低开、跳空缺口背后的预期差、事件含义与日内风险点 |
| [`growth_quality_check_skill`](./skills/growth_quality_check_skill) | 拆解公司增长来源，检查其盈利含量、现金含量、可持续性与失速风险，判断增长是否“有质量” |
| [`guidance_change_impact_skill`](./skills/guidance_change_impact_skill) | 解释业绩指引上修、下修或维持不变的真实含义、可信度与影响链条 |
| [`high_quality_compounder_finder_skill`](./skills/high_quality_compounder_finder_skill) | 筛选具备高资本回报、稳定护城河、长期复利潜力与较强盈利质量的核心候选股，并输出优先级、估值纪律与持续跟踪重点 |
| [`hot_stock_quick_read_skill`](./skills/hot_stock_quick_read_skill) | 在极短时间内解释热门股的业务、催化、市场预期、资金关注点与主要风险 |
| [`industry_chain_signal_skill`](./skills/industry_chain_signal_skill) | 从产业链上下游的景气、价格、订单、库存与盈利变化中识别机会与风险，帮助判断哪一环节在受益、承压或即将传导 |
| [`institutional_position_shift_skill`](./skills/institutional_position_shift_skill) | 识别机构持仓变化、共识强化与调仓方向，帮助判断哪些公司或行业正在被增配、减配或重新定价 |
| [`intraday_abnormal_move_alert_skill`](./skills/intraday_abnormal_move_alert_skill) | 识别盘中急拉、急跌、放量、换手突变等异常波动，并快速解释可能驱动、持续性和应对重点 |
| [`macro_event_market_impact_skill`](./skills/macro_event_market_impact_skill) | 解读利率、通胀、就业、增长等宏观事件对股市、风格和行业的影响路径，帮助判断短线冲击与中期含义 |
| [`major_announcement_impact_skill`](./skills/major_announcement_impact_skill) | 分析并购、减持、定增、重大合同等公告的影响路径、受益受损方与后续风险 |
| [`management_quality_check_skill`](./skills/management_quality_check_skill) | 快速检查管理层背景、激励机制、资本配置、治理质量与潜在红旗信号，判断是否值得给予管理层信用 |
| [`market-environment-analysis`](./skills/market-environment-analysis) | Comprehensive market environment analysis and reporting… |
| [`market_breadth_health_skill`](./skills/market_breadth_health_skill) | 判断指数上涨或下跌背后是否有足够市场广度支撑，识别行情是健康扩散、局部抱团还是虚弱反弹 |
| [`market_regime_switch_skill`](./skills/market_regime_switch_skill) | 判断市场处于进攻、防守、震荡或切换阶段，并解释风格、广度、情绪与宏观环境的匹配关系 |
| [`market_sentiment_temperature_skill`](./skills/market_sentiment_temperature_skill) | 量化市场情绪冷热、风险偏好与交易拥挤度，帮助判断当前市场处于亢奋、均衡、谨慎还是恐慌状态 |
| [`moat_strength_review_skill`](./skills/moat_strength_review_skill) | 评估公司竞争优势的来源、强度、可持续性与削弱风险，判断护城河是否真实存在并能转化为回报 |
| [`northbound_capital_flow_skill`](./skills/northbound_capital_flow_skill) | 追踪北向资金或外资偏好的变化、行业流向与风格迁移，帮助判断资金面支持、抱团方向与潜在反转线索 |
| [`pead_opportunity_skill`](./skills/pead_opportunity_skill) | 识别财报后漂移行情中值得跟踪的中短线机会，判断预期修正、价格延续与失效边界 |
| [`peer_comparison_decision_skill`](./skills/peer_comparison_decision_skill) | 横向比较同业候选公司的业务质量、增长、盈利、估值与催化差异，并给出相对强弱结论 |
| [`policy_headline_interpreter_skill`](./skills/policy_headline_interpreter_skill) | 解读政策新闻对行业、题材和个股的影响路径、受益方向与执行不确定性，帮助区分真正政策催化与噪音扰动 |
| [`position-sizer`](./skills/position-sizer) | Calculate risk-based position sizes for long stock trad… |
| [`position_sizing_decision_skill`](./skills/position_sizing_decision_skill) | 根据风险预算、波动特征、交易把握度与组合承受力，给出单笔交易的合理仓位大小与分批节奏建议 |
| [`post-market-debrief`](./skills/post-market-debrief) | 用于盘后复盘，聚焦日常复盘 / 市场研究 / 交易总结 |
| [`premarket_trade_checklist_skill`](./skills/premarket_trade_checklist_skill) | 在开盘前对候选交易进行逐项核查，覆盖催化剂、流动性、计划完整性、环境适配与风险暴露，输出可执行清单与放弃条件 |
| [`price_target_reach_alert_skill`](./skills/price_target_reach_alert_skill) | 当股价接近、触达或穿越目标价时，生成分批处理、继续持有或重新评估的动作建议 |
| [`pullback_opportunity_finder_skill`](./skills/pullback_opportunity_finder_skill) | 寻找回调充分但趋势未被破坏、承接结构尚可的候选股，并输出观察区间、反转信号与失效条件 |
| [`sec_filing_question_answer_skill`](./skills/sec_filing_question_answer_skill) | 从10-K、10-Q、招股书等监管文件中定位依据并回答具体问题 |
| [`sector_rotation_radar_skill`](./skills/sector_rotation_radar_skill) | 识别板块轮动、资金切换与风格迁移方向，帮助判断当前市场主线、补涨方向与轮动持续性 |
| [`shareholder_letter_digest_skill`](./skills/shareholder_letter_digest_skill) | 总结股东信中的长期战略、经营变化、资本配置与管理层信号 |
| [`stock_first_look_skill`](./skills/stock_first_look_skill) | 首次接触个股时，快速建立公司业务、市场关注点、关键指标、估值位置与主要风险的基础认知 |
| [`stock_research_memo_writer_skill`](./skills/stock_research_memo_writer_skill) | 生成结构化、可分享的个股研究备忘录，沉淀投资逻辑、核心分歧、估值判断、风险与跟踪清单 |
| [`stop_loss_discipline_skill`](./skills/stop_loss_discipline_skill) | 为单笔交易设计价格止损、逻辑止损与时间止损规则，并给出触发后的执行动作与复核顺序 |
| [`support_break_warning_skill`](./skills/support_break_warning_skill) | 围绕支撑位、压力位、前高前低、趋势线等关键价格位置生成预警与应对提示 |
| [`take_profit_ladder_skill`](./skills/take_profit_ladder_skill) | 为盈利中的持仓设计分批止盈路径、保本上移规则与继续持有条件，平衡兑现收益与保留趋势利润 |
| [`theme-detector`](./skills/theme-detector) | Detect and analyze trending market themes across sector… |
| [`theme_heat_tracker_skill`](./skills/theme_heat_tracker_skill) | 跟踪主题题材的热度变化、扩散层级、拥挤程度与持续性，帮助判断题材处于启动、强化、扩散还是退潮阶段 |
| [`theme_leader_identification_skill`](./skills/theme_leader_identification_skill) | 识别热门题材中的龙头、中军、跟随股与掉队股，判断谁最值得优先跟踪，并输出题材阶段、驱动链条与风险提示 |
| [`trade_plan_builder_skill`](./skills/trade_plan_builder_skill) | 为单笔交易生成包含入场条件、仓位安排、止损止盈、验证节点与应急动作的完整执行计划 |
| [`trading_halt_resume_tracker_skill`](./skills/trading_halt_resume_tracker_skill) | 跟踪停牌、临停、复牌事件的原因、进展、潜在影响与复牌后观察框架 |
| [`trim_or_hold_decision_skill`](./skills/trim_or_hold_decision_skill) | 在持仓明显盈利或短期大涨后，判断是应部分兑现还是继续持有，并给出决策依据、分层动作与剩余仓位持有条件 |
| [`turnaround_story_validation_skill`](./skills/turnaround_story_validation_skill) | 验证困境公司是否真的出现反转证据，拆解修复路径、时间窗口、失败边界与赔率条件 |
| [`valuation-pricing-framework`](./skills/valuation-pricing-framework) | 用于估值与定价框架，聚焦估值分析 / 定价逻辑 / 投资决策 |
| [`valuation_snapshot_skill`](./skills/valuation_snapshot_skill) | 快速判断个股当前估值的高低、历史分位、同业相对位置与重估条件 |
| [`value_dividend_candidate_skill`](./skills/value_dividend_candidate_skill) | 筛选估值具备安全边际、股息水平有吸引力且分红可持续的收益型股票，并输出优先级、风险点与跟踪重点 |
| [`vcp_breakout_scan_skill`](./skills/vcp_breakout_scan_skill) | 筛选波动逐级收缩、抛压减弱、结构趋于成熟的突破预备股，并输出关键位置、确认信号与风险边界 |
| [`volume_spike_reasoning_skill`](./skills/volume_spike_reasoning_skill) | 对股票盘中或日内放量异动进行归因，判断是消息驱动、资金行为、情绪扩散还是技术性放量 |
| [`watchlist_news_impact_digest_skill`](./skills/watchlist_news_impact_digest_skill) | 汇总自选股在指定时间窗口内的重要新闻、公告与舆情变化，并判断偏利多、利空或中性影响 |
| [`wind-find-finance-skill`](./skills/wind-find-finance-skill) | 万得金融能力发现与安装路由入口 |

> `wind-find-finance-skill` 是入口型 meta-skill，不调 MCP server、不需要 API Key。
> `wind-alice` 是万得 Alice Agent 入口，需要 API Key。

---

## 🚀 安装

### 📍 关于安装位置（先看一眼）

下方所有命令默认带 `-g`（全局）：

- ✅ **全局** `-g`：装一次，所有项目 + 机器上所有已识别的 AI agent 都能用。
- 🔒 **仅当前项目**：把命令里的 `-g` **去掉**即可。

不确定就用全局。

### 推荐入口：先装金融能力发现器

```bash
npx skills add Wind-Alice/AliceMarket --skill wind-find-finance-skill -g -y
```

装好后，用户直接问金融问题即可。AI 会通过 SKILL.md 守则按用户问题筛 1-3 个相关 skill 推荐安装。

### 装单个 skill

```bash
npx skills add Wind-Alice/AliceMarket --skill <skill-name> -g -y
```

把 `<skill-name>` 换成上方表格里的任意 Skill 名称即可。

### 列出仓库内所有可装 skill

```bash
npx skills add Wind-Alice/AliceMarket --list
```

> `-y` 跳过交互菜单（必加）。`-g` 含义见上方"关于安装位置"段。

---


### 让 AI 帮你打开开发者中心拿 Key（推荐）

装好后，第一次问行情 / 基金 / 财务 / 公告问题，AI 会发现没 Key 并**主动询问**："要我现在帮你打开万得开发者中心吗？" 同意后，AI 在 SKILL.md 所在目录下运行：

```bash
node scripts/cli.mjs open-portal
```

跨平台自动调浏览器（macOS `open` / Linux `xdg-open` / Windows `start`），打开 `https://market.windalice.com/`：已登录直接复制 API Key；未登录先登录再回到该页。

### 拿到 Key 后配置（推荐全局配置）

macOS / Linux / Git Bash:

```bash
mkdir -p ~/.wind-aifinmarket && echo "WIND_API_KEY=ak_xxx" > ~/.wind-aifinmarket/config
```

Windows cmd:

```bat
if not exist "%USERPROFILE%\.wind-aifinmarket" mkdir "%USERPROFILE%\.wind-aifinmarket"
echo WIND_API_KEY=ak_xxx > "%USERPROFILE%\.wind-aifinmarket\config"
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.wind-aifinmarket"
Set-Content -Path "$env:USERPROFILE\.wind-aifinmarket\config" -Value "WIND_API_KEY=ak_xxx" -Encoding UTF8
```

### 三级兜底（按优先级）

1. 环境变量 `WIND_API_KEY`
2. SKILL.md 同目录 `config.json`
3. 全局 `~/.wind-aifinmarket/config`（**推荐**，所有 wind skill 共享）

---

## ✅ 验证安装

在支持 skills 的客户端里，直接问一个金融问题：

```text
贵州茅台最新股价
```

如果客户端支持查看本地 skill 目录，也可以确认已出现 `wind-find-finance-skill` 和 `wind-mcp-skill`。

---

## 💡 使用示例

安装并配置 Key 后，直接向 AI 提金融问题：

```text
贵州茅台今天最新价
从各个维度分析 600183
查一下科创50ETF最近一个月走势
510050期权近一个月波动率怎么样
Tesla和比亚迪的估值对比
```

AI 会根据问题自动选择可用能力。取数类问题优先使用 `wind-mcp-skill`；需要分析工作流时，先通过 `wind-find-finance-skill` 推荐合适能力。

---

## 🧭 wind-mcp-skill 的 server_type 选择守则

| 你想问 | server_type | 按需加载契约 |
| --- | --- | --- |
| 股票行情、K 线、财务、估值、股东、资金、筛选 | `stock_research` | `references/stock/` |
| 基金 / ETF / REITs 全维数据（档案、净值、持仓、业绩、归因） | `fund_research` | `references/fund/` |
| 期权（合约截面、序列、波动率、情绪、定价） | `options_data` | `references/options/` |
| 期货（供需、基差、仓单、期限结构） | `futures_data` | `references/futures/futures.md` |
| 企业工商、股东、司法、舆情、经营风险 | `company_data` | `references/company/` |
| 宏观、行业与区域经济指标（EDB） | `edb_data` | `references/economic/economic.md` |
| 指数、板块行情与指标 | `index_data` | `references/index/` |
| 债券档案、行情估值、发债主体 | `bond_data` | `references/bond/bond.md` |
| 公告 / 年报 / 招股书 / 财经新闻 / 研报 | `financial_docs` | `references/financial-docs/financial-docs.md` |
| 专项未覆盖的聚合与指标计算 | `analytics_data` | `references/analytics/analytics.md` |
| 专项未覆盖的通用行情、指标、报表、文档与投研参考 | `general_data` | `references/general/general.md` |

更详细的工具表见 [`skills/wind-mcp-skill/SKILL.md`](./skills/wind-mcp-skill/SKILL.md)。

---

## 📂 目录结构

```
Wind AliceMarket/
├── README.md                       ← 你现在看的这份
└── skills/                         ← 所有 skill 直接平铺，对齐 npx skills 协议
    ├── wind-find-finance-skill/    ← 入口（纯 SKILL.md + references）
    ├── wind-mcp-skill/             ← 万得 Wind 金融数据访问（11 个 MCP server）
    ├── tushare-finance-skill/      ← Tushare Pro 金融数据
    ├── wind-alice/                 ← 万得 Alice Agent（A2A + SSE）
    └── …                           ← 其余金融技能类 skill，见上方表格
```

---

## 📝 许可

© Wind AliceMarket 2026
