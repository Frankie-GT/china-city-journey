# 中国城市之旅 (China City Journey)

> **山川行迹 · 县域风物志**  
> 优雅还原中国经典出版挂图《县域地图》质感的三级（省-市-县）行政区划交互式地图与城市深度人文风物阅读系统。

---

## 🌟 核心特性

- **出版物级典雅视觉**：深度还原《县域地图.jpeg》的暖米色宣纸质感底色（`#F6F3EB`）、传统莫兰迪低饱和行政分色、三级边界线条宽度系统（省界粗实线 / 市界中细实线 / 县界虚线）以及典雅宋体排版。
- **三级无缝平滑下钻**：
  - **全国（省级）**：包含全国 34 个省级行政区及规范版南海诸岛附图，首屏仅约 400KB，秒开渲染。
  - **地级市**：点击省份自动缩放平移并异步加载该省所有地级市矢量多边形。
  - **区县级**：点击地级市/区县高亮显示，与右侧图文抽屉无缝联动。
- **图文双向联动阅览抽屉**：
  - 点击市级时，右侧抽屉展开该城市的深度人文地理长文（从《文稿》解析）。
  - 点击具体区县时，右侧长文自动平滑滚动定位至对应 `## 县名` 章节并呼吸高亮。
  - 暂未撰写深度文稿的城市，自动展示民政部标准区划编码、拼音及下辖区县列表，并展示“作者采风收录中”友好占位卡。
- **即时模糊搜索**：支持全拼、首字母缩写、中文简繁快速定位全国任意省、市、县。
- **零构建极简部署**：纯静态原生架构（HTML5 + ES6 + Leaflet + CSS3），无需任何 Webpack/Vite 繁琐打包，天然支持 GitHub Pages / Gitee Pages 免费一键托管。

---

## 📂 项目结构

```text
中国城市之旅/
├── web/                           # 前端纯静态网站目录（可直接部署至 GitHub Pages）
│   ├── index.html                 # 页面主入口
│   ├── css/
│   │   └── style.css              # 典雅出版物/宣纸质感样式表
│   ├── js/
│   │   └── app.js                 # 核心交互、地图下钻、图文联动控制器
│   └── data/                      # 优化切片后的轻量矢量与文稿数据
│       ├── china_provinces.json   # 全国省级矢量地图（~400KB）
│       ├── articles.json          # 文稿深度解析索引
│       ├── city_meta.json         # 全国 3600+ 行政节点速查索引
│       └── provinces/             # 分省市县切片（按需加载，单省约 100~400KB）
│           ├── 11.json            # 北京市
│           ├── 42.json            # 湖北省
│           ├── 51.json            # 四川省
│           └── ...                # 全国各省
├── 文稿/                          # 您的城市原创文章库（Markdown 格式）
│   ├── 湖北 襄阳.md
│   ├── 四川 宜宾.md
│   ├── 内蒙古 包头.md
│   └── 湖南 衡阳.md
├── scripts/                       # 自动化数据处理管线
│   ├── build_articles.py          # 自动解析「文稿」并生成 articles.json
│   ├── prepare_geo.py             # 提取并抽稀 AreaCity 矢量边界生成切片
│   └── setup_mcp.py               # Antigravity MCP 服务配置向导
├── AreaCity-JsSpider-StatsGov/    # 民政部标准地理与区划源数据（CGCS2000坐标系）
├── mcp-china-geonames-server/     # 基于 FastMCP 的国家地名库实时查询服务
└── .agents/skills/china-geonames/ # Antigravity 专用地名技能配置
```

---

## 🚀 本地启动与浏览

在项目根目录下，直接启动任意轻量 HTTP 静态服务器即可：

```bash
# 进入 web 目录并启动 Python 本地服务器
python3 -m http.server 8080 -d web
```

打开浏览器访问：**`http://localhost:8080`**，即可开始探索华夏城市之旅！

---

## ✍️ 如何新增城市文稿？（一键编译流程）

当你想收录一个新城市时，操作极为简便：

1. **新建 Markdown 文件**：在 `文稿/` 目录下创建文件，命名规则为 `[省份] [城市].md`（例如：`陕西 西安.md`、`江苏 苏州.md`）。
2. **规范排版**：
   - 一级标题 `# 城市名：核心特色`（如 `# 襄阳：坚城 3区3县3市`）。
   - 一级标题下方编写城市总体历史文化与经济概述。
   - 二级标题 `## 区县名：风物标签`（如 `## 谷城县：贡米 豆腐乳 骆驼蓄电池`），下方编写具体区县的特色风貌。
3. **一键更新数据**：
   ```bash
   python3 scripts/build_articles.py
   ```
   脚本将秒级完成解析，地图中该城市会自动被打上红色的“**已收录**”印章，刷新网页即可看到联动效果！

---

## 🌐 部署到 GitHub Pages / Gitee Pages

本项目采用统一仓库管理，已为您预设好自动化工作流，部署零门槛：

### 方式 A：部署到 GitHub Pages（首选，全自动）
1. 在 GitHub 新建一个仓库（如 `china-city-journey`）。
2. 本地执行推送：
   ```bash
   git init
   git add .
   git commit -m "feat: initial release"
   git remote add origin https://github.com/your-username/china-city-journey.git
   git branch -M main
   git push -u origin main
   ```
3. 在 GitHub 仓库的 **Settings** -> **Pages** 中，**Source** 选择 **GitHub Actions**。
4. 项目内置的 `.github/workflows/deploy.yml` 会自动把 `web/` 目录发布上线，访问 `https://your-username.github.io/china-city-journey/` 即可！

### 方式 B：部署到 Gitee Pages
1. 在 Gitee 新建仓库并推送代码。
2. 进入仓库 **服务** -> **Gitee Pages**。
3. **部署目录** 填写：`web`，点击 **启动 / 更新**。

---

## 🛠️ 日常文稿与样式维护指南

- **新增/修改城市文稿**：
  1. 在 `文稿/` 目录新建或编辑 `[省份] [城市].md`。
  2. 终端运行 `python3 scripts/build_articles.py` 一键生成最新索引。
  3. 提交并推送：`git add 文稿 web/data/articles.json && git commit -m "docs: update article" && git push`。
- **修改网页样式（配色、字体、间距）**：
  1. 打开 `web/css/style.css` 修改 CSS 变量或选择器规则。
  2. 浏览器强制刷新（Cmd+Shift+R）查看。
  3. 满意后推送到 Git 仓库。
- **修改交互与地图行为**：
  直接在 `web/js/app.js` 中调整参数，本地测试无误后推送即可。

## 🤖 Antigravity MCP 与 Skill 说明

1. **Skill 规范**：
   - 已为您在 `.agents/skills/china-geonames/SKILL.md` 中配置完成。Antigravity 会自动识别该技能，让 AI 深入理解中国行政区划与民政部地名规范。
2. **MCP 服务配置**：
   - 运行向导脚本：
     ```bash
     python3 scripts/setup_mcp.py
     ```
   - 脚本会自动向 `~/.gemini/config/mcp_config.json` 写入地名库服务。配合 `pip3 install -r mcp-china-geonames-server/requirements.txt`，AI 即可直接调用地名库 API 实时查询地名和区划。
