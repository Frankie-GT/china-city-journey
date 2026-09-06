# ANTIGRAVITY.md - 《中国城市之旅》开发与维护指南

> 本文件是本项目（《中国城市之旅》）针对 **Antigravity AI 助手** 的专属开发与维护指引（等同于 Claude Code 的 `CLAUDE.md`）。  
> 无论是日常撰写文稿、调整地图渲染样式，还是重构数据处理管线，Antigravity 均需以本指南为统一上下文与操作规范。

---

## 🗺️ 项目概述与架构定位

本项目旨在优雅还原中国经典出版挂图《县域地图》质感，构建一个纯静态、无前端框架打包依赖（原生 HTML5 + ES6 + CSS3 + Leaflet）的中国三级（省-市-县）行政区划交互地图与城市人文风物阅读系统。

### 核心架构分布
```text
中国城市之旅/
├── web/                           # 前端纯静态部署根目录（直接发布到 GitHub Pages）
│   ├── index.html                 # 主入口页面（响应式地图、搜索栏、面包屑、图文抽屉）
│   ├── css/
│   │   └── style.css              # 典雅出版物莫兰迪纸质样式（宣纸底色、三级边界、移动端抽屉）
│   ├── js/
│   │   └── app.js                 # 地图引擎控制器（下钻、动态注记、跨省邻接高亮、联动抽屉）
│   └── data/                      # 前端按需加载的轻量矢量与索引数据
│       ├── china_provinces.json   # 全国 34 个省级行政区矢量多边形（~400KB）
│       ├── articles.json          # 已收录城市文稿结构化索引（由 build_articles.py 编译）
│       ├── city_meta.json         # 全国 3600+ 行政节点检索索引（拼音/缩写/层级）
│       ├── neighbors_cities.json  # 地级跨省邻接区划拓扑（外省邻市轮廓）
│       ├── neighbors_districts.json # 县级跨市邻接区划拓扑（邻市/邻省县级轮廓）
│       └── provinces/{id}.json    # 34 省市县级矢量切片（按需加载，单省约 100~400KB）
├── 文稿/                          # 用户原创城市风物志文稿库（Markdown 格式）
│   ├── 湖北 襄阳.md
│   ├── 四川 宜宾.md
│   ├── 内蒙古 包头.md
│   └── 湖南 衡阳.md
├── scripts/                       # 自动化数据处理管线（Python）
│   ├── build_articles.py          # 编译「文稿/」目录为 web/data/articles.json
│   ├── build_neighbors.py         # 计算全国地级与县级跨界邻接拓扑多边形
│   ├── prepare_geo.py             # 从 AreaCity 原始数据抽稀生成省市县切片
│   └── setup_mcp.py               # Antigravity 本地国家地名库 MCP 服务配置向导
├── .agents/skills/china-geonames/ # Antigravity 专用地名与区划技能规范
└── .github/workflows/static.yml   # GitHub Pages 官方自动化部署工作流（发布 web/ 目录）
```

---

## 🛠️ 常用开发与维护命令

### 1. 本地启动静态服务器
```bash
# 进入并托管 web 目录（端口推荐 8080）
python3 -m http.server 8080 -d web
# 访问地址：http://localhost:8080
```

### 2. 编译城市文稿索引（新增或修改文稿后运行）
```bash
# 秒级解析「文稿/」所有 Markdown 文件，生成 web/data/articles.json
python3 scripts/build_articles.py
```

### 3. 重构或更新邻接区划拓扑数据
```bash
# 重新计算外省邻市与外市邻县的拓扑关系
python3 scripts/build_neighbors.py
```

### 4. Git 提交与同步推送
```bash
# 提交文稿与网页代码并推送到 GitHub（Actions 会自动发布 web 目录）
git add web 文稿 scripts README.md ANTIGRAVITY.md .gitignore .github
git commit -m "docs: add new city article and update styles"
git push origin main
```

---

## ✍️ 城市文稿编写规范

在 `文稿/` 目录下新增或编辑文件，请严格遵循以下规则以便脚本精确解析并与地图图层双向联动：

1. **文件名规则**：`[省份] [城市].md`（如 `陕西 西安.md`、`江苏 苏州.md`）。
2. **文档结构规范**：
   ```markdown
   # 襄阳：坚城 3区3县3市

   襄阳位于湖北省西北部，汉江中游。南连荆襄，北通宛洛，历来为南北通衢、兵家必争之地……（城市总体历史地理与人文概述）

   ## 襄城区：古城风华
   襄阳城墙雄踞汉水之滨，昭明台巍峨耸立……

   ## 樊城区：商埠烟火
   樊城自古为商贾汇聚之码头……

   ## 谷城县：贡米 豆腐乳 骆驼蓄电池
   谷城西枕武当，东临汉江……
   ```
3. **联动效果**：
   - 地图点击该城市时，右侧抽屉展开并渲染文稿。
   - 地图点击下辖区县（如 `谷城县`）时，抽屉会自动平滑滚动定位至 `## 谷城县：...` 章节并带有呼吸边框高亮。
   - 暂未撰写文稿的城市，抽屉会自动展示标准行政编码、拼音及下辖区县，并贴心展示“作者采风收录中”提示。

---

## 🎨 地图制图与视觉规范（出版物级标准）

在调整 `web/css/style.css` 或 `web/js/app.js` 时，务必坚守《县域地图》的出版物设计哲学：

| 视觉元素 | 设计规范与参数 |
| :--- | :--- |
| **底色与基底** | 温暖宣纸底色 `#F6F3EB`，正文墨色 `#2C2724` / 辅助深灰 `#5A524C` |
| **莫兰迪行政配色** | 12 色低饱和传统矿物色系（`#E7DFD5`, `#DFD9CC`, `#DDD7CA`, `#D8D2C4` 等），相克轮转着色 |
| **三级边界层级** | 省界：`#5C554F` 实线 2.5px；市界：`#7D756D` 实线 1.5px；县界：`#A49C92` 虚线 `3, 3` 0.8px |
| **注记文字与光晕** | 字体：`Noto Serif SC` / `Songti SC`；文字微型阴影或 `#F6F3EB` 2px 文字光晕，严禁背景框遮挡地图线条 |
| **注记展示层级** | **省级视野**：仅标注 34 省名称；**进入某省**：仅显示该省下辖地级市名称；**点击地级市**：仅显示该市下辖区县名称 |
| **邻省/邻市渲染** | 选中地级市时，外围同屏显示邻省邻市多边形与标注（虚实有别）；选中区县时，同屏呈现接壤外市邻县 |
| **移动端适配** | 宽度 `< 768px` 时，右侧抽屉转为底部抽屉（Bottom Sheet）。**默认处于收起状态**，仅当点击有文稿收录的区县时才自动展开，保证手机端极佳的纯净读图体验 |

---

## 🔒 仓库清洁与敏感数据规范

1. **绝对禁止提交到 Git 仓库的内容**：
   - 原始爬虫与大体积 CSV（如 `AreaCity-JsSpider-StatsGov`、`ok_geo.csv`，超百兆）。
   - 原始 GIS Shapefile（如 `ChinaAdminDivisonSHP`）。
   - 本地设计大图（如 `县域地图.jpeg` 18MB）。
   - 外部克隆的第三方子模块（如 `MapStage/`, `china-geonames-skill/`, `mcp-china-geonames-server/`）。
2. **GitHub Pages 部署路径**：
   - 部署入口统一设为 `web` 目录（`.github/workflows/static.yml` 中 `path: 'web'`），绝不对外暴露根目录杂项。

---

## 🧠 Antigravity Skill 与 MCP 协同

- **Skill 路径**：`.agents/skills/china-geonames/SKILL.md`  
  Antigravity 会自动读取该技能，用于准确核实全国行政区划三级编码（民政部标准）、地名规范拼音和空间邻接关系。
- **本地 MCP 服务**：通过 `python3 scripts/setup_mcp.py` 可一键向 `~/.gemini/config/mcp_config.json` 注册国家地名库本地查询能力。
