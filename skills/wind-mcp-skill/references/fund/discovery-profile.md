# `fund_research` 基金发现与档案

用于相似基金发现和基金基本资料查询。

## 目录

- [`fund_get_similar_funds`](#fund-get-similar-funds)
- [`fund_get_basic_info`](#fund-get-basic-info)

## 工具契约

### `fund_get_similar_funds`

【功能】根据基金代码查询基金的相似基金信息，寻找同类可比基金候选。

【适用场景】用于寻找同类产品，比较候选基金的相似度得分、成立日期、规模、评级、申赎状态和基金经理等基本信息；已确定目标基金后再进行比较。

【返回】返回同类可比基金列表及上述基本字段；查询基金自身从候选中剔除，候选不足时按实际可用数量返回，字段缺失单独说明。

【边界】相似度结果用于筛选同类候选，不等同于业绩、评级或风险结论；无法判断查询目的时先按基金数据类别选择相应能力。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `windCode` | 是 | `string` | 最短：1；最长：32 | 单只基金代码或基金名称，例如 "510300.OF" 或 "华夏成长"。 |
| `startDate` | 否 | `string` | 正则：^[0-9]{4}-[0-9]{2}-[0-9]{2}$ | 开始日期 YYYY-MM-DD；省略时按 endDate 往前一年；不得晚于 endDate。 |
| `endDate` | 否 | `string` | 正则：^[0-9]{4}-[0-9]{2}-[0-9]{2}$ | 截止日期 YYYY-MM-DD；省略时用调用当天。 |
| `onlyValid` | 否 | `boolean` | 默认：true | 控制相似度分析报表是否只展示初始基金。 |

### `fund_get_basic_info`

【功能】获取单只或多只基金的基础档案，包含产品识别、分类、成立日期、管理人、基金经理和业绩比较基准等字段。

【适用场景】用于确认基金代码与简称，查看基金分类、成立日期、管理人、现任基金经理、业绩比较基准及按需档案字段。

【返回】返回每只基金的识别信息和基础档案；自然名称无法唯一匹配时返回候选或歧义状态，不静默选取其他基金。

【边界】基础档案适合作为后续净值、规模、持仓和业绩查询的实体入口，不包含这些专题数据；名称或代码无法唯一匹配时先确认基金主体，再进行后续查询。

| 参数 | 必填 | 类型 | 约束 | 官方说明 |
| --- | --- | --- | --- | --- |
| `windCodes` | 是 | `array<string>` | 最少项：1；最多项：50；元素唯一：是 | 基金代码或基金名称列表，例如 ["000001.OF", "广发稳健增长A"] |
| `includeFields` | 否 | `array<string>` | 最少项：0；最多项：100；元素唯一：是 | 指定需要返回的字段助记符列表，留空返回默认字段包（成立日/投资类型/管理人/基金经理/业绩基准）；可选 f_info_setupdate=基金成立日 / f_info_investtype=投资类型(二级分类) / f_info_mgrcomp=基金管理人 / f_info_fundmanager=基金经理(现任) / f_info_benchmark=业绩比较基准 / f_info_fullname=基金全称 / f_info_code=基金代码 / f_info_frontendcode=基金前端代码 / f_info_backendcode=基金后端代码 / s_info_isincode=ISIN代码 / f_info_firstinvesttype=投资类型(一级分类) / f_info_type=基金类型 / f_style_marketvaluestyleattribute=市值-风格属性 / f_info_investmentregion=投资区域 / f_info_maturitydate_2=基金到期日 / f_info_loflisteddate=上市日期 / f_info_exchmarket=基金上市地点 / f_info_minholdingperiod=基金最短持有期 / f_info_t0ornot=是否T+0交易 / f_info_custodianbank=基金托管人 / f_info_foreigninvestmentadvisor=境外投资顾问 / f_info_foreigncustodian=境外托管人 / f_info_investobject=投资目标 / f_info_investscope=投资范围 / f_info_investstrategy2=基金投资策略 / f_info_investingregiondescription=主要投资区域说明 / f_info_managementfeeratio=管理费率 / f_info_custodianfeeratio=托管费率 / f_info_salefeeratio=销售服务费率 / f_info_purchasefeeratio=最高申购费率 / f_info_redemptionfeeratio=最高赎回费率 / f_info_relatedcode=关联基金代码；f_info_windcode、f_info_name 必返、即使未传也会置顶返回。 |
