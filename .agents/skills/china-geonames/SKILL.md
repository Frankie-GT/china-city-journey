---
name: "china-geonames"
description: "查询中国国家地名信息库的行政区划和地名数据。当用户询问中国地名、行政区划、地理坐标，或需要按名称、代码、拼音查找地点时调用此技能。"
---

# 中国地名信息库 API

## 概述

本API提供对中国·国家地名信息库的访问，数据采用CGCS2000坐标系。

---

## 1. 行政区划搜索

**接口URL:** `https://dmfw.mca.gov.cn/9095/xzqh/getList`

**请求方式:** GET

**请求参数:**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| year | int | 否 | 最新年版 | 年份 |
| code | String | 否 | - | 行政区划代码 |
| maxLevel | int | 是 | - | 查询深度：0=仅本级，1=本级及下级，2=本级及下下级 |

**响应参数:**

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Object[] | 返回结果集 |
| data[].code | String | 行政区划代码 |
| data[].name | String | 标准名称 |
| data[].level | int | 行政区划级别 |
| data[].type | String | 行政区划单位 |
| data[].children | Object[] | 子级行政区划 |
| message | String | 服务信息 |
| status | int | 服务状态码 |
| total | int | 总条数 |

---

## 2. 地名搜索

**接口URL:** `https://dmfw.mca.gov.cn/9095/stname/listPub`

**请求方式:** GET

**请求参数:**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| stName | String | 是 | - | 标准名称 |
| placeTypeCode | String | 否 | - | 类别代码 |
| year | int | 否 | - | 年份 |
| searchType | String | 否 | 模糊 | 匹配方式：精确/模糊 |
| code | String | 否 | - | 行政区划代码 |
| page | int | 否 | - | 页码 |
| size | int | 否 | - | 每页大小 |

**响应参数:**

| 参数名 | 类型 | 说明 |
|--------|------|------|
| records | Object[] | 返回结果集 |
| records[].id | String | 数据ID |
| records[].place_code | String | 地名代码 |
| records[].standard_name | String | 标准名称 |
| records[].ethnic_minorities_writing | String | 少数民族语书写 |
| records[].place_type | String | 地名类别 |
| records[].place_type_code | String | 地名类别代码 |
| records[].province_name | String | 省级政区名称 |
| records[].city_name | String | 市级政区名称 |
| records[].area_name | String | 区县级政区名称 |
| records[].area | String | 区县级行政代码 |
| records[].city | String | 市级行政代码 |
| records[].province | String | 省级行政代码 |
| records[].gdm | Object | 空间坐标信息(GeoJson) |
| records[].gdm.type | String | 类型 |
| records[].gdm.coordinates | Object | 空间坐标 |
| total | int | 数据总数 |

---

## 3. 地名详情获取

**接口URL:** `https://dmfw.mca.gov.cn/9095/stname/detailsPub`

**请求方式:** POST

**请求参数:**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | String | 是 | 地名ID |

**响应参数:**

| 参数名 | 类型 | 说明 |
|--------|------|------|
| area_name | String | 所在区县名称 |
| city_name | String | 所在地市名称 |
| old_name | String | 历史地名 |
| ethnic_minorities_writing | String | 少数民族语书写 |
| gdm | Object | 空间坐标信息(GeoJson) |
| gdm.type | String | 类型 |
| gdm.coordinates | Object | 空间坐标 |
| government_history | String | 政区的历史沿革 |
| id | String | 数据ID |
| place_code | String | 地名代码 |
| place_history | String | 地名的历史沿革 |
| place_meaning | String | 地名的含义 |
| place_origin | String | 地名的来历 |
| place_type | String | 地名类别 |
| place_type_code | String | 地名类别代码 |
| province_name | String | 省级政区名称 |
| roman_alphabet_spelling | String | 罗马字母拼写 |
| standard_name | String | 标准名称 |
| area | String | 区县级行政代码 |
| city | String | 市级行政代码 |
| province | String | 省级行政代码 |

---

## 4. 同名区划统计

**接口URL:** `https://dmfw.mca.gov.cn/9095/datastatis/GroupCountNameByCode`

**请求方式:** GET

**请求参数:**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| distCode | String | 否 | 区划代码 |
| name | String | 是 | 地名 |

**响应参数:**

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Object[] | 接口返回的数据集 |
| data[].name | String | 区划名称 |
| data[].count | int | 数量 |
| data[].code | String | 区划代码 |
| message | String | 服务信息 |
| status | int | 服务状态码 |
| total | int | 总数 |

---

## 5. 同名类别统计

**接口URL:** `https://dmfw.mca.gov.cn/9095/datastatis/GroupCountNameByType`

**请求方式:** GET

**请求参数:**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| distCode | String | 是 | 区划代码 |
| name | String | 是 | 地名 |

**响应参数:**

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Object[] | 接口返回的数据集 |
| data[].type | String | 地名类别名称 |
| data[].typeCode | String | 地名类别代码 |
| data[].count | int | 数量 |
| message | String | 服务信息 |
| status | int | 服务状态码 |
| total | int | 数据总数 |

---

## 6. 同音区划统计

**接口URL:** `https://dmfw.mca.gov.cn/9095/datastatis/GroupCountPinyinByCode`

**请求方式:** GET

**请求参数:**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| distCode | String | 否 | 区划代码 |
| name | String | 是 | 罗马字母拼写（拼音） |

**响应参数:**

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Object[] | 接口返回的数据集 |
| data[].name | String | 区划名称 |
| data[].count | int | 数量 |
| data[].code | String | 区划代码 |
| message | String | 服务信息 |
| status | int | 服务状态码 |
| total | int | 数据总数 |

---

## 7. 同音类别统计

**接口URL:** `https://dmfw.mca.gov.cn/9095/datastatis/GroupCountPinyinByType`

**请求方式:** GET

**请求参数:**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| distCode | String | 是 | 区划代码 |
| name | String | 是 | 罗马字母拼写（拼音） |

**响应参数:**

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Object[] | 接口返回的数据集 |
| data[].type | String | 地名类别名称 |
| data[].typeCode | String | 地名类别代码 |
| data[].count | int | 数量 |
| message | String | 服务信息 |
| status | int | 服务状态码 |
| total | int | 数据总数 |

---

## 调用示例

**搜索北京市名称包含"故宫"的地名：**
- URL: `https://dmfw.mca.gov.cn/9095/stname/listPub`
- 方法: GET
- 参数: `stName=故宫&code=11&searchType=模糊&page=1&size=10`

**获取广东省行政区划（两级）：**
- URL: `https://dmfw.mca.gov.cn/9095/xzqh/getList`
- 方法: GET
- 参数: `code=44&maxLevel=2`

**获取地点详情：**
- URL: `https://dmfw.mca.gov.cn/9095/stname/detailsPub`
- 方法: POST
- Body: `{"id":"27612aa5-1e2f-4e40-ac9f-a44a23625b61"}`

---

## 代码生成指引

Agent读取此SKILL.md后，可按以下方式生成代码：

1. **选择请求方法**: GET请求使用`params`传参，POST请求使用`json`传参
2. **构建URL**: 基础URL + 接口路径
3. **处理响应**: 解析返回的JSON数据
4. **错误处理**: 检查`status`字段和`message`字段
