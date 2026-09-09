# `fund_research` 基金业绩与归因

用于基金业绩、Brinson 归因、收益归因、择时选股和风格分析。

## 目录

- [`fund_get_brinson_attribution`](#fund-get-brinson-attribution)
- [`fund_get_style_analysis`](#fund-get-style-analysis)
- [`fund_get_return_attribution`](#fund-get-return-attribution)
- [`fund_get_selection_timing_analysis`](#fund-get-selection-timing-analysis)
- [`fund_get_performance`](#fund-get-performance)

## 工具契约

### `fund_get_brinson_attribution`

【功能】根据基金代码、比较基准和分析区间查询指定基准的 Brinson 归因分析。

【适用场景】用于分析资产配置效应、行业或板块选择效应和交互效应；核对基金与基准在各行业或板块的配置差异、收益差异及超额收益来源。

【返回】返回行业或板块、基金与基准权重和收益、差异项，以及配置、选择、交互效应和归因贡献；标注分析区间、持仓范围和行业分类口径。

【边界】比较基准、区间和持仓口径必须保持一致；结果适合与行业配置、基金净值因子和业绩表现结合核对，不替代其中任一单项数据；不适用于单只证券明细或未指定基准的收益判断。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `windCode` | 是 | `string` | 最短：1；最长：32 | 单只基金代码或基金名称，例如 "510300.OF" 或 "华夏成长"。 |
| `benchCode` | 是 | `string` | 默认："000001.SH"；最短：1；最长：32 | 比较基准 Wind 代码（指数或基金）；默认 000001.SH。 |
| `reportDate` | 否 | `string` | 正则：^[0-9]{4}-[0-9]{2}-[0-9]{2}$ | 查询报告期（季度末）YYYY-MM-DD；省略时取最新报告期（输出 reportDateDefaulted=true）。 |
| `heldFundType` | 否 | `string` | 枚举："1" / "2"；默认："1" | 持仓模式，1=全部持股（默认，中报/年报）/ 2=重仓持股（季报）。 |
| `queryMode` | 否 | `string` | 枚举："1" / "2"；默认："2" | 查询模式，1=当前报告期区间 / 2=下一季度区间（默认）。 |
| `industryStandard` | 否 | `string` | 枚举："0" / "1" / "2" / "3" / "5"；默认："2" | 行业分类标准，0=证监会 / 1=申万一级 / 2=万得一级（默认）/ 3=中信一级 / 5=申万一级2021。 |

### `fund_get_style_analysis`

【功能】根据基金代码和分析区间查询基金风格暴露分析数据，可指定风格或使用默认组合。

【适用场景】用于查看月度或季度风格暴露变化、最新一期主导风格、各风格暴露占比和拟合优度；默认关注大盘价值、大盘成长、小盘价值、小盘成长和债券现金五类。

【返回】返回各周期末的风格暴露、各风格占比和拟合优度，并标注实际日期、分析频率和缺失周期；最新一期暴露可用于识别主导风格。

【边界】风格暴露是模型分析结果，不等同于实际持仓明细或净值收益归因；可与持仓结构和多因子结果交叉核对，分析频率和区间应保持一致；拟合不足或缺期时不作延伸判断。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `windCode` | 是 | `string` | 最短：1；最长：32 | 单只基金代码或基金名称，例如 "510300.OF" 或 "华夏成长"。 |
| `startDate` | 否 | `string` | 正则：^[0-9]{4}-[0-9]{2}-[0-9]{2}$ | 开始日期 YYYY-MM-DD；省略时按 endDate 前推 1 年。 |
| `endDate` | 否 | `string` | 正则：^[0-9]{4}-[0-9]{2}-[0-9]{2}$ | 截止日期YYYY-MM-DD；省略时用调用当天。 |
| `cycle` | 否 | `string` | 枚举："monthly" / "quarterly"；默认："monthly" | 分析周期 monthly（默认）/ quarterly；不支持 weekly/daily/yearly。 |
| `indexs` | 否 | `array<string>` | 最少项：0；最多项：50；元素唯一：是 | 风格指数 Wind 代码列表，留空用默认 5 个（大盘价值/大盘成长/小盘价值/小盘成长/中债总财富）；支持自定义任意 Wind 风格指数代码，最多 50 个。 |

### `fund_get_return_attribution`

【功能】根据基金代码、基准及分析区间查询基金多因子模型分析结果，分析基金收益变化的主要因子来源。

【适用场景】用于查看基金相对市场、规模、价值、盈利、投资等因子的敏感度，核对主动收益分解、区间收益贡献和风险贡献。

【返回】返回模型口径、各因子敏感度、主动收益分解、区间收益贡献、风险贡献及因子模型对基金收益的拟合优度；实际区间与所选基准单独标明。

【边界】模型因子只覆盖所选模型纳入的因子，不等同于行业持仓归因；应与基金相对基准表现和行业配置结果按同一期间交叉核对；缺少基准或模型条件时只返回可计算部分。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `windCode` | 是 | `string` | 最短：1；最长：32 | 单只基金代码或基金名称，例如 "510300.OF" 或 "华夏成长"。 |
| `benchmarkWindCode` | 是 | `string` | 默认："510300BI.WI"；最短：1；最长：32 | 基准 Wind 代码（指数或基金），例如 510300BI.WI。 |
| `startDate` | 是 | `string` | 正则：^[0-9]{4}-[0-9]{2}-[0-9]{2}$ | 开始日期，格式 YYYY-MM-DD；必须 ≤ endDate。应根据分析周期和因子模型设置合理的分析区间，确保区间内有足够的有效样本，否则可能无法完成归因分析。 |
| `endDate` | 是 | `string` | 正则：^[0-9]{4}-[0-9]{2}-[0-9]{2}$ | 截止日期YYYY-MM-DD；必填。 |
| `modelType` | 否 | `string` | 枚举："capm" / "ff3" / "ff4" / "ff5" / "ff6"；默认："ff5" | 因子模型 capm / ff3 / ff4 / ff5（默认）/ ff6；模型不含的因子项返回 null。 |
| `cycle` | 否 | `string` | 枚举："weekly" / "monthly" / "quarterly" / "yearly" / "daily"；默认："weekly" | 分析周期 weekly / monthly / quarterly / yearly / daily（默认）。 |
| `marketIndex` | 否 | `string` | 默认："881001.WI"；最短：1；最长：32 | MKT 计算用的市场指数 Wind 代码，默认 881001.WI（万得全A）。 |
| `riskRate` | 否 | `string` | 枚举："1" / "2" / "3" / "4" / "5" / "6" / "7" / "8"；默认："2" | 无风险收益类型 1=一年定存税前 / 2=一年定存税后（默认）/ 3=一年期国债 / 4=央票 / 5=银行间七日回购 / 6=五年定存税前 / 7=零 / 8=十年定存税前。 |

### `fund_get_selection_timing_analysis`

【功能】根据基金代码和分析区间查询基金主动管理能力分析结果，评估选股能力、择时能力和综合主动管理能力。

【适用场景】用于查看主动管理能力得分、同类排名、同类分位，比较基金主动管理能力与同类平均水平。

【返回】返回选股、择时及综合能力指标或得分、同类排名、分位情况、同类平均水平和比较差异，并标注统计区间、同类样本数和数据状态。

【边界】该结果依赖成立年限、分析区间和同类样本；样本不足时按不适用或未计算表达，不以底层异常替代业务状态；可与区间业绩和净值因子结果结合，但不单独形成交易结论。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `windCode` | 是 | `string` | 最短：1；最长：32 | 单只基金代码或基金名称，例如 "000001.OF" 或 "华夏成长"。 |
| `year` | 否 | `string` | 枚举："1" / "2" / "3" / "5"；默认："3" | 诊断周期 1=近1年 / 2=近2年 / 3=近3年（默认）/ 5=近5年。 |
| `date` | 否 | `string` | 正则：^[0-9]{4}-[0-9]{2}-[0-9]{2}$ | 统计日期 YYYY-MM-DD；必须为真实月末日期；省略时用最近月末。 |

### `fund_get_performance`

【功能】根据基金代码和分析区间查询基金业绩表现及风险评价数据。

【适用场景】用于查看不同区间收益、同类排名和 Wind 评级，比较波动率、回撤、下行风险及 Sharpe、信息比率、Alpha、Beta 等风险调整收益指标。

【返回】返回收益、同类排名、Wind 评级、风险指标和风险调整收益指标，并标注统计区间、截止日、年化口径和基准；缺失与不适用分开表达。

【边界】各收益和风险指标必须按同一截止日、频率、年化方式和基准解释；可与单位净值、主动管理和因子分析组合核对，但本结果只描述历史统计，不延伸为交易判断。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `windCodes` | 是 | `array<string>` | 最少项：1；最多项：50；元素唯一：是 | 基金代码或基金名称列表，例如 ["000001.OF", "广发稳健增长A"] |
| `includeFields` | 否 | `array<string>` | 最少项：0；最多项：100；元素唯一：是 | 字段助记符列表，留空返回默认包（10 收益+8 排名+2 评级+12 风险三窗口）；可选 f_return_1w=近1周回报 / f_return_1m=近1月回报 / f_return_3m=近3月回报 / f_return_6m=近6月回报 / f_return_1y=近1年回报 / f_return_2y=近2年回报 / f_return_3y=近3年回报 / f_return_5y=近5年回报 / f_return_ytd=今年以来回报 / f_return_std=成立以来回报 / f_nav_periodreturnranking_1w=近1周回报排名 / f_nav_periodreturnranking_1m=近1月回报排名 / f_nav_periodreturnranking_3m=近3月回报排名 / f_nav_periodreturnranking_6m=近6月回报排名 / f_nav_periodreturnranking_1y=近1年回报排名 / f_nav_periodreturnranking_3y=近3年回报排名 / f_nav_periodreturnranking_5y=近5年回报排名 / f_nav_periodreturnranking_ytd=今年以来回报排名 / f_rating_wind3y=Wind3年评级 / f_rating_wind5y=Wind5年评级 / f_risk_stdevyearly=年化波动率 / f_risk_maxdownside=最大回撤 / f_risk_maxdownside_recoverdays=最大回撤恢复天数 / f_risk_downsiderisk=下行风险 / f_risk_annutrackerror_index=跟踪误差(跟踪指数,年化) / f_risk_sharpe=Sharpe / f_risk_inforatio=信息比率 / f_risk_treynor=Treynor / f_risk_sortino=Sortino / f_risk_calmar=Calmar / f_risk_alpha=Alpha_FUND / f_risk_beta=Beta_FUND；f_risk_*（除评级）自动展开近1/3/5年窗口；f_info_windcode、f_info_name 必返、即使未传也会置顶返回。 |
| `asOfDate` | 否 | `string` | 正则：^\d{4}-\d{2}-\d{2}$ | 截止日期 YYYY-MM-DD；非交易日回溯至前一交易日；不传用最近交易日。 |
| `benchmarkWindCode` | 否 | `string` | 默认："000300.SH"；最短：1；最长：40 | 风险调整字段基准指数，默认 000300.SH。 |
