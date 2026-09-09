# `options_data` 期权定价

用于二元期权和香草期权定价。

## 目录

- [`options_calc_binary`](#options-calc-binary)
- [`options_calc_vanilla`](#options-calc-vanilla)

## 工具契约

### `options_calc_binary`

【功能】计算现金或资产兑付型二元期权价格，到期时按标的价格是否满足条件支付固定金额或标的资产。

【适用场景】用于比较看涨与看跌二元期权，以及现金兑付和资产兑付条款下的 NPV 与定价敏感度。

【返回】返回 NPV、Delta、Rho、Theta、Gamma、Vega 及实际估值日期、定价模型、期权类型和标的类别，数值与单位分开表达。

【边界】依赖调用方明确提供现价、行权价、到期日、波动率和利率等参数，不负责补查市场数据；可在相同市场参数下与其他期权模型作基准比较，但不同赔付条款不能混用，结果不构成交易判断。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `assetClass` | 是 | `string` | 枚举："equity" / "fx" / "futures" | 标的资产类别, equity: 股票/指数/ETF/基金，fx: 外汇，futures:期货。 |
| `spotPrice` | 是 | `number` | — | 标的资产现价 |
| `optionType` | 是 | `string` | 枚举："call" / "put" | 期权类型：看涨(call) 或 看跌(put)。 |
| `strikePrice` | 是 | `number` | — | 执行价格。 |
| `expirationDate` | 是 | `string` | 正则：^\d{4}-\d{2}-\d{2}$ | 到期日期 (YYYY-MM-DD)。 |
| `valuationDate` | 是 | `string` | 正则：^\d{4}-\d{2}-\d{2}$ | 估值日期 (YYYY-MM-DD)。 |
| `volatility` | 是 | `number` | — | 年化隐含波动率 (小数形式)。格式转换：如果用户输入 '25' 或 '25%'，请填入 0.25；如果输入 0.25，则保持不变。 |
| `riskFreeRate` | 是 | `number` | — | 年化无风险利率 (小数形式)。对于 FX 期权，填入本币(计价货币)无风险利率。 |
| `dividendYield` | 是 | `number` | — | 第二利率(小数形式)：Equity:输入年化股息率；FX:输入外币(基础货币)无风险利率；Futures:通常填0。 |
| `payoffType` | 否 | `string` | 枚举："cash" / "asset"；默认："cash" | 二元期权类型：cash:现金或无（Cash-or-Nothing），到期支付固定金额；asset:资产或无（Asset-or-Nothing），到期支付标的价格。 |
| `cashAmount` | 否 | `number` | 默认：100 | 固定的获赔金额。仅当 payoffType = cash 时有效。 |
| `dayCount` | 否 | `string` | 枚举："actual" / "business"；默认："actual" | 计日惯例（时间T的计算方式）：actual:基于日历日，business:基于交易日 |

### `options_calc_vanilla`

【功能】计算普通香草期权价格，支持欧式或美式看涨、看跌期权，并按指定或匹配模型返回定价结果。

【适用场景】用于计算普通期权价格，比较波动率、利率、股息率、行权方式和模型选择对结果的影响。

【返回】返回 NPV、Delta、Rho、Theta、Gamma、Vega，以及行权方式、实际估值日期、到期日和定价模型，数值与单位分开表达。

【边界】依赖调用方提供已确认的市场参数，不查询现价、波动率或利率；可作为二元、障碍、亚式及结构化产品的共同基准，但不同现金流条款不能直接混合，结果不构成交易判断。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `assetClass` | 是 | `string` | 枚举："equity" / "fx" / "futures"；默认："equity" | 标的资产类别, equity: 股票/指数/ETF/基金，fx: 外汇，futures:期货。 |
| `spotPrice` | 是 | `number` | — | 标的资产现价 |
| `optionType` | 是 | `string` | 枚举："call" / "put"；默认："call" | 期权类型：看涨(call) 或 看跌(put)。 |
| `strikePrice` | 是 | `number` | — | 执行价格。 |
| `expirationDate` | 是 | `string` | 正则：^\d{4}-\d{2}-\d{2}$ | 到期日期 (YYYY-MM-DD)。 |
| `valuationDate` | 是 | `string` | 正则：^\d{4}-\d{2}-\d{2}$ | 估值日期 (YYYY-MM-DD)。 |
| `volatility` | 是 | `number` | — | 年化隐含波动率 (小数形式)。格式转换：如果用户输入 '25' 或 '25%'，请填入 0.25；如果输入 0.25，则保持不变。 |
| `riskFreeRate` | 是 | `number` | — | 年化无风险利率 (小数形式)。对于 FX 期权，填入本币(计价货币)无风险利率。 |
| `dividendYield` | 是 | `number` | — | 第二利率(小数形式)：Equity:输入年化股息率；FX:输入外币(基础货币)无风险利率；Futures:通常填0。 |
| `exerciseStyle` | 否 | `string` | 枚举："european" / "american"；默认："european" | 行权方式：european:欧式，american: 美式。 |
| `pricingMethod` | 否 | `string` | 枚举："bs" / "baw" / "binomial"；默认："bs" | 定价模型：美式优先用baw其次binomial，欧式用bs。 |
| `dayCount` | 否 | `string` | 枚举："actual" / "business"；默认："actual" | 计日惯例（时间T的计算方式）：actual:基于日历日，business:基于交易日。 |
| `timeSteps` | 否 | `integer` | 默认：100 | 时间步数。仅当 pricingMethod 为 'binomial' 时有效。 |
