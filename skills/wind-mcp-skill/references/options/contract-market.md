# `options_data` 期权合约与市场序列

用于上市期限、期限指标、合约序列、品种序列和品种统计。

## 目录

- [`options_get_listed_terms`](#options-get-listed-terms)
- [`options_get_term_metrics`](#options-get-term-metrics)
- [`options_get_contract_series`](#options-get-contract-series)
- [`options_get_variety_series`](#options-get-variety-series)
- [`options_get_variety_stats`](#options-get-variety-stats)

## 工具契约

### `options_get_listed_terms`

【功能】按期权标的和交易日查询存续期限结构，返回期权品种、到期日、期限类型、合约乘数类型和行权方式。

【适用场景】用于确认当前可用期限，为选择到期日和期权链范围提供依据，并核对欧式期权的期限属性。

【返回】逐条返回存续期限及其属性，并标注实际查询日期；没有匹配期限时明确返回无存续记录。

【边界】只处理品种和期限层面的存续关系，不展开合约历史行情、链上档位或波动率节点；后续查询应沿用本结果的品种代码和到期日。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `windCode` | 是 | `string` | — | 期权标的代码或名称，如510050.SH或华夏上证50ETF。 |
| `tradeDate` | 否 | `string` | 默认："2026-09-01"；正则：^\d{4}-\d{2}-\d{2}$；格式：date | 交易日（格式为YYYY-MM-DD）。查询上市期权品种期限的日期。 |

### `options_get_term_metrics`

【功能】按期权品种、交易日、到期日和标的参考价查询期权链截面，返回合约基础信息、量价、隐含波动率及 Delta、Gamma、Vega、Theta。

【适用场景】用于查看某一到期日的上下档位，比较认购与认沽合约的价格、成交量、持仓量和风险指标。

【返回】按合约逐条返回代码、名称、类型、行权价、合约乘数、量价和风险指标，并标注截面交易日；无匹配时明确返回空截面。

【边界】只反映一个交易日和一个到期日的截面，不替代存续期限或历史序列；品种、到期日、合约代码及指标应与相关结果逐项核对，不能把档位筛选当成完整市场行情。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `optionVarietyCode` | 是 | `string` | — | 期权品种代码，如510050OP.SH表示上证50ETF期权。通常由上游工具 `options_get_listed_terms` 的返回结果中获取。 |
| `tradeDate` | 否 | `string` | 默认："2026-06-01"；正则：^\d{4}-\d{2}-\d{2}$；格式：date | 交易日（格式为YYYY-MM-DD）。查询上市期权品种期限的日期。 |
| `expiryDate` | 是 | `string` | 正则：^\d{4}-\d{2}-\d{2}$；格式：date | 期权到期日（格式为YYYY-MM-DD）。指定要获取哪个期限下的期权链。通常由上游工具 `options_get_listed_terms` 的返回结果中获取。 |
| `underlyingPrice` | 否 | `number` | — | 期权标的现价。与strikeLevels配合使用，确定行权价筛选区间的中心点。该数值的单位随资产类型变化（股票为货币单位，指数为点数，商品为对应计价单位等），但传入时直接使用市场报价的原始数值，不做任何单位换算。确保该数值与期权链中的行权价位于同一数值标尺上、可直接比较即可。若不传，则返回该期限下的全部期权合约。 |
| `indicators` | 否 | `array<string>` | 元素枚举："lastPrice" / "settlePrice" / "volume" / "openInterest" / "oiChange" / "iv" / "ivChange" / "delta" / "gamma" / "vega" / "theta" / "change" / "pctChange" / "open" / "high" / "low"；默认：["lastPrice","settlePrice","volume","openInterest","iv","delta","gamma","vega","theta"] | 期权指标列表，可选指标包括：最新价（lastPrice）、结算价（settlePrice）、成交量（volume）、持仓量（openInterest）、持仓量变化（oiChange）、隐含波动率（iv）、波动率涨跌（ivChange）、delta、gamma、vega、theta、涨跌（change）、涨跌幅（pctChange）、开（open）、高（high）、低（low）。必须传英文键，不能传中文。 |
| `strikeLevels` | 否 | `integer` | 最小：1 | 期权合约上下档位个数，如5表示上下各5档。控制返回的期权合约范围。若不传，则忽略档位限制，返回该期限下的全部期权合约。 |

### `options_get_contract_series`

【功能】按期权合约代码查询指定历史区间内的量价、持仓、隐含波动率和 Delta、Gamma、Vega、Theta 等指标序列。

【适用场景】用于查看具体合约的历史价格和结算价，跟踪成交量、持仓量及其变化，复核单合约风险指标。

【返回】按合约、交易日和指标逐条返回观测值及单位；未取得的指标保留缺失状态，并标注实际数据区间。

【边界】只回答选定合约的历史观测，不替代同日链截面或品种级聚合指标；合约代码和指标应与截面结果一致，标的代码返回的现货字段不得误当作合约历史，未支持指标不得静默丢弃。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `optionContractCodes` | 是 | `array<string>` | — | 需要查询的期权合约代码或标的代码列表，以获取其时间序列。 |
| `indicators` | 是 | `array<string>` | 元素枚举："lastPrice" / "settlePrice" / "volume" / "openInterest" / "oiChange" / "iv" / "ivChange" / "delta" / "gamma" / "vega" / "theta" / "change" / "pctChange" / "open" / "high" / "low" | 待提取的指标列表。必须传英文键，不能传中文，可选值：最新价（lastPrice）、涨跌（change）、涨跌幅（pctChange）、结算价（settlePrice）、成交量（volume）、持仓量（openInterest）、持仓量变化（oiChange）、隐含波动率（iv）、波动率涨跌（ivChange）、delta、gamma、vega、theta、开（open）、高（high）、低（low）。 |
| `startDate` | 否 | `string` | 默认："2026-06-01"；正则：^\d{4}-\d{2}-\d{2}$；格式：date | 开始日期（格式为YYYY-MM-DD）。时序数据查询的起始日期。 |
| `endDate` | 否 | `string` | 默认："2026-09-01"；正则：^\d{4}-\d{2}-\d{2}$；格式：date | 结束日期（格式为YYYY-MM-DD）。时序数据查询的结束日期。 |

### `options_get_variety_series`

【功能】按一个或多个期权标的、单一指标和历史区间查询品种维度时间序列，覆盖隐含波动率、历史波动率、PCR 和偏度等指标。

【适用场景】用于观察品种指标的历史变化，对比多个标的的同一指标，复核指定期限、价值状态或 Delta 档位。

【返回】逐交易日返回标的、指标口径和数值，并标注实际数据区间；周末和非交易日不补造观测。

【边界】只处理品种层面的聚合序列，不展开单个合约量价或期权链档位；序列可作为分布统计和波动率分析的勾稽基础，但比较时必须保持标的、指标、期限和日期口径一致。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `windCodes` | 是 | `array<string>` | 最少项：1；元素唯一：是 | 期权标的代码或名称列表，如["华夏上证50ETF", "510300.SH"]。支持多个标的资产同时查询。 |
| `indicator` | 是 | `string` | 枚举："vol_moneyness" / "vol_delta" / "hv" / "pcr_volume" / "pcr_oi" / "pcr_turnover" / "skew" / "skew_normalized" | 待提取的期权品种时序指标类型。可选值：vol_moneyness（价值状态隐波），vol_delta（Delta维度隐波），hv（历史波动率），pcr_volume（成交量PCR），pcr_oi（持仓量PCR），pcr_turnover（成交额PCR），skew（偏度：25d Call vol - 25d Put vol），skew_normalized（相对偏度：(25d Call vol - 25d Put vol)/50d vol）。 |
| `startDate` | 否 | `string` | 默认："2026-06-01"；正则：^\d{4}-\d{2}-\d{2}$；格式：date | 开始日期（格式为YYYY-MM-DD）。时序数据查询的起始日期。 |
| `endDate` | 否 | `string` | 默认："2026-09-01"；正则：^\d{4}-\d{2}-\d{2}$；格式：date | 结束日期（格式为YYYY-MM-DD）。时序数据查询的结束日期。 |
| `tenor` | 否 | `string` | 枚举："1W" / "1M" / "2M" / "3M" / "6M" / "9M" / "1Y" / "18M" / "2Y" / "3Y" / "4Y" / "5Y" / "7Y" / "10Y"；默认："1M" | 期限标识（当indicator为vol_moneyness、vol_delta、skew或skew_normalized时必填），可选值：1W、1M、2M、3M、6M、9M、1Y、18M、2Y、3Y、4Y、5Y、7Y、10Y。 |
| `moneyness` | 否 | `string` | 枚举："30" / "40" / "60" / "80" / "90" / "95" / "97.5" / "100" / "102.5" / "105" / "110" / "120" / "130" / "150" / "175" / "200" / "250" / "300"；默认："100" | 价值状态（当indicator为vol_moneyness时必填，默认值100），可选值：30、40、60、80、90、95、97.5、100、102.5、105、110、120、130、150、175、200、250、300。 |
| `deltaLevel` | 否 | `string` | 枚举："5DP" / "10DP" / "15DP" / "25DP" / "35DP" / "50D" / "35DC" / "25DC" / "15DC" / "10DC" / "5DC"；默认："50D" | Delta档位（当indicator为vol_delta时必填，默认值50D），可选值：5DP、10DP、15DP、25DP、35DP、50D、35DC、25DC、15DC、10DC、5DC。 |
| `windows` | 否 | `string` | 默认："20" | 计算窗口（当indicator为hv时必填，默认值20个交易日）。 |

### `options_get_variety_stats`

【功能】按一个或多个期权标的、单一指标和历史区间计算品种指标的分布统计，返回当前值、均值、极值、中位数和分位数。

【适用场景】用于查看隐波、历史波动率、PCR 或偏度在区间内的分布，对比多个标的的历史位置。

【返回】逐标的返回统计区间、当前值、均值、极值、中位数及关键分位数，并标注指标参数和实际日期；无有效样本时返回合法空结果或结构化异常。

【边界】统计结果应与相同标的、指标、期限、窗口和区间的原始序列勾稽，不能替代逐日序列或合约明细；未来无样本区间不得用相同分位数伪造成功结果。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `windCodes` | 是 | `array<string>` | 最少项：1；元素唯一：是 | 期权标的代码或名称列表，如["华夏上证50ETF", "510300.SH"]。支持多个标的资产同时查询。 |
| `indicator` | 是 | `string` | 枚举："vol_moneyness" / "vol_delta" / "hv" / "pcr_volume" / "pcr_oi" / "pcr_turnover" / "skew" / "skew_normalized" | 待提取的期权品种时序指标类型。可选值：vol_moneyness（价值状态隐波），vol_delta（Delta维度隐波），hv（历史波动率），pcr_volume（成交量PCR），pcr_oi（持仓量PCR），pcr_turnover（成交额PCR），skew（偏度：25d Call vol - 25d Put vol），skew_normalized（相对偏度：(25d Call vol - 25d Put vol)/50d vol）。 |
| `startDate` | 否 | `string` | 默认："2026-06-01"；正则：^\d{4}-\d{2}-\d{2}$；格式：date | 开始日期（格式为YYYY-MM-DD）。时序数据查询的起始日期。 |
| `endDate` | 否 | `string` | 默认："2026-09-01"；正则：^\d{4}-\d{2}-\d{2}$；格式：date | 结束日期（格式为YYYY-MM-DD）。时序数据查询的结束日期。 |
| `tenor` | 否 | `string` | 枚举："1W" / "1M" / "2M" / "3M" / "6M" / "9M" / "1Y" / "18M" / "2Y" / "3Y" / "4Y" / "5Y" / "7Y" / "10Y"；默认："1M" | 期限标识（当indicator为vol_moneyness、vol_delta、skew或skew_normalized时必填），可选值：1W、1M、2M、3M、6M、9M、1Y、18M、2Y、3Y、4Y、5Y、7Y、10Y。 |
| `moneyness` | 否 | `string` | 枚举："30" / "40" / "60" / "80" / "90" / "95" / "97.5" / "100" / "102.5" / "105" / "110" / "120" / "130" / "150" / "175" / "200" / "250" / "300"；默认："100" | 价值状态（当indicator为vol_moneyness时必填，默认值100），可选值：30、40、60、80、90、95、97.5、100、102.5、105、110、120、130、150、175、200、250、300。 |
| `deltaLevel` | 否 | `string` | 枚举："5DP" / "10DP" / "15DP" / "25DP" / "35DP" / "50D" / "35DC" / "25DC" / "15DC" / "10DC" / "5DC"；默认："50D" | Delta档位（当indicator为vol_delta时必填，默认值50D），可选值：5DP、10DP、15DP、25DP、35DP、50D、35DC、25DC、15DC、10DC、5DC。 |
| `windows` | 否 | `string` | 默认："20" | 计算窗口（当indicator为hv时必填，默认值20个交易日）。 |
