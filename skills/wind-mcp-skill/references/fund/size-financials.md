# `fund_research` 基金规模与财务

用于基金规模和财务数据。

## 目录

- [`fund_get_size`](#fund-get-size)
- [`fund_get_financials`](#fund-get-financials)

## 工具契约

### `fund_get_size`

【功能】根据基金代码和指定日期或报告期查询基金规模信息。

【适用场景】用于查看资产净值、份额总数、最新规模、报告期规模和规模变化，并按时点或报告期进行勾稽。

【返回】返回每只基金的资产净值、规模、份额及变化字段，分开标注实际日期、报告期和计量单位；缺失或跨时点不可比时明确说明。

【边界】最新时点规模与报告期规模不能混用；可与实际净值、份额和持有人结构按同一日期或报告期核对，跨期计算需确认单位和子份额口径一致。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `windCodes` | 是 | `array<string>` | 最少项：1；最多项：50；元素唯一：是 | 基金代码或基金名称列表，例如 ["000001.OF", "广发稳健增长A"] |
| `asOfDate` | 否 | `string` | 正则：^\d{4}-\d{2}-\d{2}$ | 截止日期 YYYY-MM-DD，作用于 f_info_fundscale_cc、f_netasset_total2；非交易日回溯；不传用最近交易日。 |

### `fund_get_financials`

【功能】根据基金代码和报告期查询基金财务报表相关的产品级数据。

【适用场景】用于查看利润、资产价值、收入、费用和报告期净值增长率等财务指标，核对管理费、托管费等费用项目。

【返回】返回实际报告期、利润、资产、收入、费用、期末净资产和报告期净值增长率等字段，金额与单位分开标注；缺失、不适用和未计算分别表达。

【边界】财务报表数据按报告期解释，不等同于最新规模快照；应在同一报告期内核对资产、负债与期末净资产，并将净值增长率与业绩统计区分。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `windCodes` | 是 | `array<string>` | 最少项：1；最多项：50；元素唯一：是 | 基金代码或基金名称列表，例如 ["000001.OF", "广发稳健增长A"] |
| `includeFields` | 否 | `array<string>` | 最少项：0；最多项：50；元素唯一：是 | 指定返回的字段助记符列表，留空返回默认字段包（收入/净利润/投资收益/管理费/托管费等）；可选 f_stm_is=收入合计 / f_stm_is_reits_netprofit=净利润 / f_stm_is_79_total=净利润(合计) / f_stm_is_75=基金投资收益 / s_stm07_is_105=财务费用:利息收入 / f_stm_is_76=其他利息收入 / fair_value_change_income=公允价值变动收益 / fund_management_fee=基金管理费 / fund_custody_fee=基金托管费 / fund_sales_service_fee=基金销售服务费 / trading_expenses=交易费用 / audit_fee=审计费用 / other_expenses=其他费用 / interest_expense=利息支出 / ending_net_assets=期末所有者权益(基金净值) / total_assets=资产合计 / total_liabilities=负债合计 / f_nav_return=报告期净值增长率；f_info_windcode、f_info_name 必返、即使未传也会置顶返回。 |
| `reportPeriod` | 否 | `string` | 正则：^\d{4}-\d{2}-\d{2}$ | 查询报告期 YYYY-MM-DD（季末/半年末/年末）；不传用最近披露期；无数据返回 missing 不回退。 |
