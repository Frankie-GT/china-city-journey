# 国家地名信息库 MCP & Skill 实现


## 前言

不知道你有没有过这种经历——跟 AI 说「帮我查一下武汉在哪个省」，结果它一本正经地胡说八道，给你编出来一个根本不存在的行政区划代码。

又或者，做一个地址自动填充的的功能，发现手里的区划数据要么是三五年前的老黄历，要么缺斤少两，东城区给你标到河北省去了。

这些问题折磨了我很久，直到我发现了 **国家地名信息库**（dmfw.mca.gov.cn）——民政部出品的官方数据源。从 2026 年起，这玩意儿就要正式替代统计局那套统计用区划代码了，可以说是「根正苗蓝」的官方数据。

我就琢磨，能不能让 AI 直接调这个 API 来查地名？于是实现根据官方提供的API文档，实现了对应的MCP和Skill，已经开源在Github，地址在文章结尾，需要自取。

## 一、数据源是个「大家伙」——先了解清楚再下手

### 1.1 平台背景

先给不了解的同学做个简介：

- **数据来源**：中国·国家地名信息库（民政部出品）
- **基础 URL**： dmfw.mca.gov.cn
- **坐标系**：CGCS2000（2000国家大地坐标系）——不是常见的 WGS84，别搞混了
- **数据截止日期**：2025年12月31日

这个平台的数据是按年度更新的，所以查询的时候注意带上年份参数，不然可能查到的不是你想的那个版本。

### 1.2 数据结构

行政区划这玩意儿，全国不统一，有的地方只有两级，有的地方四级全齐：

| 层级 | 示例 | 说明 |
| --- | --- | --- |
| 第一级 | 北京市、湖北省 | 省级行政区 |
| 第二级 | 武汉市、北京市 | 市辖区级 |
| 第三级 | 武昌区、东城区 | 区县级 |
| 第四级 | 街道/乡镇 | 街道办、乡镇 |

**几个容易踩坑的地方**：

- **直辖市**（北京、天津、上海、重庆）比较特殊，只有两级——市直接到区，没有「市」这一级。比如你查北京，不会查到「北京市」这个层级，而是直接是「东城区」「西城区」。
- **不设区的市**：东莞、中山、儋州、嘉峪关这些，直接到镇/街道，没有中间的区级。
- **省直辖县级行政单位**：济源、仙桃、琼海这些「小不点」，也是只有两级。

所以如果你要做全国通用的地址选择器，这几种情况一定要特殊处理。

## 二、7 个接口

国家地名信息库提供了 7 个核心 API，我用了一段时间之后，感觉大部分场景前两个就够用了：

| 序号 | 接口名称 | URL | 方法 | 用途 |
| --- | --- | --- | --- | --- |
| 1 | 行政区划搜索 | /xzqh/getList | GET | 查询行政区划层级结构 |
| 2 | 地名搜索 | /stname/listPub | GET | 按名称搜索地名 |
| 3 | 地名详情获取 | /stname/detailsPub | POST | 获取地名详细信息 |
| 4 | 同名区划统计 | /datastatis/GroupCountNameByCode | GET | 统计同名地名按区划分布 |
| 5 | 同名类别统计 | /datastatis/GroupCountNameByType | GET | 统计同名地名按类别分布 |
| 6 | 同音区划统计 | /datastatis/GroupCountPinyinByCode | GET | 统计同音地名按区划分布 |
| 7 | 同音类别统计 | /datastatis/GroupCountPinyinByType | GET | 统计同音地名按类别分布 |

说实话，同名/同音统计这几个接口我目前还没用上，但留着备用总没错——万一哪天产品说「我们要做一个全国有多少个『张村』的统计」，直接调它就完了。

## 三、MCP 服务器——让 AI 直接「开口问」地名

### 3.1 先说说什么是 MCP

MCP（Model Context Protocol）这玩意儿，你可以理解为 AI 工具的「USB 接口」。以前 AI 想调个外部 API，你得写一堆 Prompt 来描述怎么调、调什么参数。现在有了 MCP，直接定义好工具，AI 就能像调用本地函数一样调远程 API，爽得很。

### 3.2 项目结构

```bash
mcp-china-geonames-server/
├── server.py          # MCP 服务器主文件
├── requirements.txt   # Python 依赖
└── README.md          # 项目文档
```

就三个文件，简单明了。

### 3.3 核心代码——直接抄就行

我直接上代码，注释写得比较详细：

```python
from mcp.server.fastmcp import FastMCP
import requests
from typing import Optional

mcp = FastMCP("China GeoNames MCP Server")

BASE_URL = "https://dmfw.mca.gov.cn/9095"

@mcp.tool()
def search_administrative_division(
    year: Optional[int] = None,
    code: Optional[str] = None,
    maxLevel: int = 1
) -> dict:
    """行政区划搜索——查某个地区的下级区划"""
    params = {"maxLevel": maxLevel}
    if year:
        params["year"] = year
    if code:
        params["code"] = code
    response = requests.get(f"{BASE_URL}/xzqh/getList", params=params)
    return response.json()

@mcp.tool()
def search_place_name(
    stName: str,
    placeTypeCode: Optional[str] = None,
    year: Optional[int] = None,
    searchType: str = "模糊",
    code: Optional[str] = None,
    page: int = 1,
    size: int = 10
) -> dict:
    """地名搜索——按名字查地点，支持模糊匹配"""
    params = {
        "stName": stName,
        "searchType": searchType,
        "page": page,
        "size": size
    }
    if placeTypeCode:
        params["placeTypeCode"] = placeTypeCode
    if year:
        params["year"] = year
    if code:
        params["code"] = code
    response = requests.get(f"{BASE_URL}/stname/listPub", params=params)
    return response.json()

@mcp.tool()
def get_place_details(id: str) -> dict:
    """地名详情——拿到 ID 之后查详细信息"""
    response = requests.post(f"{BASE_URL}/stname/detailsPub", json={"id": id})
    return response.json()
```

几个小提示：

- `maxLevel=1` 就是只查下一级，`maxLevel=3` 就是查三级。建议先试试 `maxLevel=1`，不然数据量会让你怀疑人生（全国三级数据大概 300KB 左右）。
- `code` 参数传空字符串代表从根开始查，传具体代码查该节点下的子级。

### 3.4 安装与运行

```bash
# 安装依赖
pip install -r requirements.txt

# 运行服务器
python server.py
```

就这些，没有了。跑起来之后，配置到你的 AI 客户端（Claude Desktop、Cline 之类的），就可以开聊了。

## 四、Skill

### 4.1 为什么要有 Skill

MCP 是让 AI「会调」API，Skill 则是让 AI「懂」API。

举个例子，没有 Skill 的时候，你让 AI 帮你查「武汉属于哪个省」，它可能得试好几次才能蒙对。有了 Skill，AI 直接就知道：这个接口返回的 `data[].code` 是行政区划代码，`data[].name` 是名称，应该怎么组合查询。

### 4.2 格式示例

我把官方 API 的契约用结构化的方式描述出来，AI 看了就知道怎么用：

```markdown

## 1. 行政区划搜索

**URL:** `https://dmfw.mca.gov.cn/9095/xzqh/getList`

**请求方式:** GET

**请求参数:**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| year | int | 否 | 最新年版 | 年份 |
| code | String | 否 | - | 行政区划代码 |
| maxLevel | int | 是 | - | 查询深度 |

**响应参数:**

| 参数名 | 类型 | 说明 |
|--------|------|------|
| data | Object[] | 返回结果集 |
| data[].code | String | 行政区划代码 |
| data[].name | String | 标准名称 |
```

格式其实很直接，就是参数说明 \+ 响应说明。关键是写清楚类型、是否必填、默认值这些，AI 才能准确地生成调用代码。

## 五、浏览器控制台调试——不用装任何东西

如果你只是想快速试试这个 API 能不能跑通，最方便的方法是直接打开浏览器控制台。

**按 F12** → 切换到 Console 标签 → 粘贴下面的代码回车：

```javascript

// 获取全国省市区三级数据（数据量较大，约300KB）
var response = await fetch("https://dmfw.mca.gov.cn/9095/xzqh/getList?code=&maxLevel=3");
var data = await response.json();
console.log(data);

// 只获取省级数据（推荐初次使用）
var response = await fetch("https://dmfw.mca.gov.cn/9095/xzqh/getList?code=&maxLevel=1");
var data = await response.json();
console.log(data);

// 获取湖北省 省、市、区三级
var response = await fetch("https://dmfw.mca.gov.cn/9095/xzqh/getList?code=420000000000&maxLevel=3");
var data = await response.json();
console.log(data);

// 获取武汉市 市、区县、乡镇街道三级
var response = await fetch("https://dmfw.mca.gov.cn/9095/xzqh/getList?code=420100000000&maxLevel=3");
var data = await response.json();
console.log(data);
```

这个方法的好处是 **所见即所得**——返回什么数据你立刻就能看到，比 Postman 还快，而且不用装任何软件。调试接口的时候贼方便，谁用谁知道。

## 六、社区轮子——不要重复造

说实话，自己处理这套四级行政区划数据还挺麻烦的。好在社区里已经有大佬做了更易用的封装：

https://github.com/xiangyuecn/AreaCity-JsSpider-StatsGov (GitHub)

这个项目把国家地名信息库的四级数据整合到单个 CSV 文件里，还附带了：

- 拼音标注（妈妈再也不用担心我读错「监利」了）
- 坐标和四级边界范围
- 支持导出为 MySQL、MSSQL、PgSQL、Oracle 等数据库格式
- 多级联动数据和代码生成工具

如果你不打算折腾 API，直接用这个也挺好。

## 七、项目仓库

我自己实现的 MCP 服务器和 Skill 规范都开源了，有需要自取：

| 项目 | 仓库地址 | 说明 |
| --- | --- | --- |
| MCP 服务器 | [github.com/linyshdhhcb…](https://link.juejin.cn/?target=https%3A%2F%2Fgithub.com%2Flinyshdhhcb%2Fmcp-china-geonames-server "https://github.com/linyshdhhcb/mcp-china-geonames-server") | 基于 FastMCP 实现，开箱即用 |
| Skill 规范 | [github.com/linyshdhhcb…](https://link.juejin.cn/?target=https%3A%2F%2Fgithub.com%2Flinyshdhhcb%2Fchina-geonames-skill "https://github.com/linyshdhhcb/china-geonames-skill") | 完整的 API 规范文档 |

## 结语

花了点时间把国家地名信息库的 API 跑通了，说实话比我想象中顺利——主要踩的坑都在行政区划的特殊情况上（直辖市、省直辖县这些），真正调接口的部分反而没遇到什么问题。

最后一个小建议： **线上用一定要加缓存**。这个 API 返回的数据量不小，频繁调用既慢又浪费带宽。把常用的省市区数据缓存在本地或 Redis 里，体验会好很多。

* * *

**参考资料**：

- 国家地名信息库：https://dmfw.mca.gov.cn
- 民政部公告： https://www.mca.gov.cn/n156/n186/index.html
- 开源项目：https://github.com/xiangyuecn/AreaCity-JsSpider-StatsGov
