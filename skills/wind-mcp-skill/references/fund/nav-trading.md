# `fund_research` 基金净值与交易状态

用于净值、申购赎回状态和上市基金历史价格。

## 目录

- [`fund_get_nav`](#fund-get-nav)
- [`fund_get_purchase_redemption_status`](#fund-get-purchase-redemption-status)
- [`fund_get_listed_historical_price`](#fund-get-listed-historical-price)

## 工具契约

### `fund_get_nav`

【功能】获取单只或多只基金截至指定查询日期可取得的时点单位净值。

【适用场景】用于查看单位净值、复权或累计单位净值、净值日期和币种；货币基金可查看万份收益和 7 日年化收益率，并按需展开公布类型。

【返回】返回基金代码、名称、实际净值日期、单位净值及按需字段；查询截止日与实际净值所属日期分开标注。

【边界】仅返回时点值，不提供历史或区间净值序列、分红拆分折算、区间收益、排名评级、风险指标、规模份额、场内行情或申赎状态；与规模勾稽时必须使用同一实际净值日，区间计算需另取历史数据。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `windCodes` | 是 | `array<string>` | 最少项：1；最多项：50；元素唯一：是 | 基金代码或基金名称列表，例如 ["000001.OF", "广发稳健增长A"] |
| `asOfDate` | 否 | `string` | 正则：^\d{4}-\d{2}-\d{2}$ | 截止日期 YYYY-MM-DD；不传用调用当天；实际净值日期以 f_nav_date2 为准，不一定等于截止日。 |

### `fund_get_purchase_redemption_status`

【功能】获取单只或多只基金最新的交易和申赎状态。

【适用场景】用于查看合并申赎状态，必要时展开申购状态、赎回状态、大额申购限额、场内交易状态、暂停或恢复运作日，以及定开基金封闭与开放日。

【返回】返回每只基金的申赎及交易状态和相关日期；只返回可用状态，不支持按日期查询历史状态，并标注当前状态更新时间。

【边界】只反映最新可取得状态，不提供历史状态、申赎费率、申赎清单、场内行情或基金基础档案；判断某一日期的交易资格时需结合状态生效日期和产品类型，不能用当前状态回填历史。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `windCodes` | 是 | `array<string>` | 最少项：1；最多项：50；元素唯一：是 | 基金代码或基金名称列表，例如 ["000001.OF", "广发稳健增长A"] |
| `includeFields` | 否 | `array<string>` | 最少项：0；最多项：50；元素唯一：是 | 指定字段助记符列表，留空返回默认申赎状态字段包（申购赎回状态 + 申购/赎回状态 + 交易状态 + 大额申购限额等）；可选 f_dq_status=申购赎回状态 / f_info_pchmstatus=申购状态 / f_info_redmstatus=赎回状态 / f_pchredm_largepchmaxamt=单日大额申购限额 / s_dq_tradestatus=交易状态 / f_info_date_suspension=基金暂停运作日 / f_info_date_resumption=基金恢复运作日 / f_info_startdateofclosure=定开基金封闭起始日 / f_info_lastopenday=定开基金上一开放日 / f_info_expectedendingday=预计封闭期结束日 / f_info_expectedopenday=预计下期开放日；f_info_windcode、f_info_name 必返、即使未传也会置顶返回。 |

### `fund_get_listed_historical_price`

【功能】根据基金代码和指定交易日查询基金交易行情及市场交易数据。

【适用场景】用于查看收盘价、成交量、IOPV、折溢价率、净流入额和融资融券余额等交易指标。

【返回】返回基金代码、名称、实际交易日及可取得的行情指标，单位和币种分开标注；场外基金的场内指标返回不适用。

【边界】这是指定交易日的单日行情，不替代技术分析或申赎清单；技术指标应沿用同一价格序列和交易日，跨日期比较时需明确实际交易日。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `windCodes` | 是 | `array<string>` | 最少项：1；最多项：50；元素唯一：是 | 基金代码或基金名称列表，例如 ["510300.OF", "中证500ETF南方"] |
| `includeFields` | 否 | `array<string>` | 最少项：0；最多项：50；元素唯一：是 | 指定字段助记符列表，留空返回默认行情字段包（收盘价/成交量/IOPV/IOPV溢折率/净流入额/融资融券余额）；可选 f_dq_close=收盘价 / f_dq_volume=成交量 / f_nav_iopv=IOPV / f_nav_iopv_discountratio=IOPV溢折率 / f_mf_netinflow=净流入额 / s_margin_tradingandseclendingbalance=融资融券余额；f_info_windcode、f_info_name 必返、即使未传也会置顶返回。 |
| `tradeDate` | 否 | `string` | 正则：^\d{4}-\d{2}-\d{2}$ | 行情交易日 YYYY-MM-DD；非交易日自动回溯；不传用最近交易日；同一请求所有基金共享同一实际交易日。 |
