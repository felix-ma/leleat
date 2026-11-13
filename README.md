# Leleat｜乐乐食谱替餐助手

面向幼儿园食谱的纯静态日历式展示与打印站点。管理端直接调用 DeepSeek 多模态模型识别图片，不使用 OCR；识别结果与菜品/食材知识库比对后，由 Agent 提交 JSON 和图片。这个仓库只负责读取静态 JSON、展示、溯源、打印和导出。

- 站点标题：Leleat｜乐乐食谱替餐助手
- 技术栈：Vite + Vue 3 + TypeScript + Tailwind CSS
- 部署：GitHub Pages（`gh-pages` 分支）
- 前端边界：**不包含图片上传、OCR、图像识别、LLM 调用、后端接口或在线写入仓库**

## 功能

- **日视图**：默认显示今天；周一到周日日历条可切换日期，上一天/下一天/日期选择/回到今天
- **周视图**：7 列日历，周一至周五展示食谱，周末显示无食谱；点击任意一天进入日视图
- 每餐展示时间、菜品、识别食材、过敏风险、替餐建议
- 每道菜可打开「溯源」：
  - 识别食材列表
  - 菜品知识库收录次数、首次/最近出现日期
  - 当天食谱原图
- 风险菜品红色标记，安全菜品绿色标记；整餐安全时显示“本餐对乐乐安全，无需替换。”
- 菜品知识库计数展示，Agent 可增量追加，同名菜复用历史食材
- 动态替餐库：按过敏原、适用菜名、优先级和餐内去重选择，不把某道菜的替餐写死在代码里
- 导出弹窗：
  - DOCX：A4 横向周表，周一至周五 5 列，红色风险菜品 + 括号内已确认替餐
  - DOCX 补剂表：周一至周日 7 列，每个补剂一行、每格勾选框
  - CSV：风险菜品替餐明细
- **在线打印**：浏览器直接打印 A4 横向周表 + 7 天补剂勾选清单
- 加载骨架、数据失败提示、单条食谱校验跳过、响应式布局

## 快速开始

要求 Node.js 20+。

```bash
npm ci
npm run dev
```

GitHub Pages 项目站点使用 `/leleat/` 作为 base，本地开发地址：

```text
http://localhost:5173/leleat/
```

常用命令：

```bash
npm run typecheck   # TypeScript / Vue 类型检查
npm run build       # 类型检查 + 生成 dist/
npm run preview     # 预览构建结果，http://localhost:4173/leleat/
npm run split       # 一次性迁移：把旧的单体 recipes.json 拆成 index.json + weeks/
npm run sync-variants  # 改了 dish-meta.json 的菜名别名后，重算周文件里的 variantId
npm run catalog     # 从 weeks/*.json 重建菜品知识库与食材索引
npm run deploy      # 构建并发布 gh-pages 分支
```

## Python 管理端工具：项目级 venv

站点本身是纯前端（Node + Vite），但仓库外的 Agent 管理端脚本会用到 Python：裁图与横线检测（[agent/images.md](agent/images.md) §10.2）、中间结果 JSON Schema 校验、DeepSeek 多模态识别（[agent/recognition.md](agent/recognition.md) §3.3）、线上图片哈希核对等。这些脚本按 [agent/publish.md](agent/publish.md) §12 的 CLI 契约以 `python …` 调用。

**约定：Python 依赖一律装在项目级 `.venv/`，不装进全局 `python3`，也不提交 `.venv/`。** 这样 Linux 环境重装、或换机器时，按 `requirements.txt` 一条命令即可重建，不会再把依赖散落在系统里被清空。

重建（在项目根目录，要求 Python 3.10+，本机为 3.12）：

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/python -m pip install -r requirements.txt
```

验证：

```bash
./.venv/bin/python -c "import PIL, numpy, jsonschema, openai; print('deps OK')"
```

调用管理端脚本时一律用 `./.venv/bin/python`（不要写裸 `python3` / `pip install`）；`agent/publish.md` §12 里的 `python …` 示例按此理解。`.venv/` 已加入 [.gitignore](.gitignore)，`requirements.txt` 由 `./.venv/bin/python -m pip freeze` 锁定，升级依赖后请回写该文件。

| 包 | 用途 | 出处 |
| --- | --- | --- |
| `Pillow` | 打开图片、裁切、JPEG 压缩、转灰度 | [agent/images.md](agent/images.md) §10.2 裁图 |
| `numpy` | 每行暗像素占比、横线定位、裁后自检 | [agent/images.md](agent/images.md) §10.2 / §10.3 |
| `jsonschema` | 中间结果 / 知识库 JSON 校验与失败重试 | [agent/recognition.md](agent/recognition.md) §3.3 |
| `openai` | DeepSeek OpenAI 兼容多模态调用 | [agent/recognition.md](agent/recognition.md) §3.3 |

> 说明：仓库当前**没有**可执行的 `.py` 脚本，`agent/*.md` 中的 Python 片段是规则与 §12 建议 CLI 契约；依赖清单覆盖这些片段用到的库，避免下次补脚本时再临时装包。pip 源使用本机 `/etc/pip.conf` 的清华镜像，无需在仓库内配置。

## 系统级依赖（apt / 系统软件）

上面的 `.venv/` 只负责 Python 库。还有一类依赖是**操作系统级软件**（apt 包）：它们不进 `.venv/`、也不进 `node_modules/`，由 `apt-get` 装到系统里；Linux 环境重装后同样会丢，按下面一条命令即可重建。这类依赖只服务于 DOCX / 打印验收，不影响前端构建与 Pages 部署。

| apt 包 | 提供的命令 / 能力 | 谁在用 |
| --- | --- | --- |
| `libreoffice-writer` | `soffice`：把 DOCX 转 PDF，实测导出 Word 是否只占一页 | [scripts/check-docx.mjs](scripts/check-docx.mjs)（`npm run check-docx`） |
| `fonts-noto-cjk` | 中文字体（Noto Sans CJK SC 等） | `soffice` 转 PDF 时渲染中文表格；缺字体时中文变方框、版式与页数判定会失真 |
| `fontconfig` | `fc-list` 等字体工具 | 检查中文字体是否就绪 |
| `poppler-utils` | `pdfinfo` / `pdftoppm` / `pdftotext` | 人工核对转换出的 PDF 页数、把 PDF 转图检查版式（`check-docx.mjs` 本身不直接调用，排障时用） |

安装（Ubuntu 24.04 / Debian，需要 root）：

```bash
sudo apt-get update
sudo apt-get install -y libreoffice-writer fonts-noto-cjk fontconfig poppler-utils
```

> 本环境为免 Root 的 proot、直接以 root 运行，去掉 `sudo` 即可。apt 源使用本机配置的镜像（见 `/etc/apt/sources.list.d/`）；不要在仓库里配置镜像，也不要把这些系统包提交进 Git。

验证：

```bash
soffice --version                                  # LibreOffice 版本
fc-list :lang=zh | head                            # 有输出即中文字体就绪
command -v pdfinfo pdftoppm                       # poppler 工具
npm run check-docx -- docs/samples/leleat-2026-W45-sample.docx   # 实测导出的 Word 是否单页
```

### 容器 / proot 环境的已知限制

在部分容器（含 proot / Termux 类环境）里，`/proc` 由宿主机以 `hidepid` 方式挂载，`/proc/version`、`/proc/stat` 可能返回 `Permission denied`。此时 LibreOffice 的启动器会报 `ERROR: /proc not mounted - LibreOffice is unlikely to work well if at all` 并退出，`soffice --version` 与 `npm run check-docx` 随之失败——但 **apt 包本身是装好的**，直接调用主程序可正常转换：

```bash
/usr/lib/libreoffice/program/soffice.bin --headless --norestore \
  --convert-to pdf --outdir /tmp docs/samples/leleat-2026-W45-sample.docx
```

`check-docx.mjs` 固定调用 `soffice`（启动器），所以在这类环境里若需走 `npm run check-docx`，得先让 `/proc/version` 可读（例如由环境维护者 bind-mount 一个可读文件），或改用上面的主程序直连命令做人工验收。这是宿主机 `/proc` 挂载策略问题，不是依赖缺失，也不需要改仓库脚本。

> 说明：`npm run measure-docx`（[scripts/measure-docx-height.mjs](scripts/measure-docx-height.mjs)）是纯 Node 估算、**不依赖**这些系统软件；只有 `check-docx` 及人工把 PDF 转图核对才需要 apt 包。前端 `npm run build` / `npm run deploy` 完全不需要 LibreOffice。

## 部署到 GitHub Pages

1. 仓库名保持 `leleat`（与 `vite.config.ts` 的 `base: '/leleat/'` 对应）。
2. 配置远程地址并推送 `main`：

   ```bash
   git remote add origin git@github.com:<你的用户名>/leleat.git
   git push -u origin main
   ```

3. 发布构建产物：

   ```bash
   npm run deploy
   ```

4. 仓库 **Settings → Pages** 选择 `gh-pages` 分支根目录。
5. 站点地址：`https://<你的用户名>.github.io/leleat/`。

`public/.nojekyll` 会随构建复制到 `dist/`。如果仓库名不是 `leleat`，必须同步修改 `vite.config.ts` 的 `base`。

## 存储方案：为什么是 JSON

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| Markdown | 不采用 | 适合说明书，不适合稳定 key、数组、去重、匹配和机器校验 |
| SQLite | 不作运行时主库 | GitHub Pages 没有后端；浏览器不能安全写回 Git；SQLite 可作为本地 Agent 的索引缓存，但最终发布 JSON |
| JSON | **采用** | 可直接 fetch、Git diff 清晰、可人工审查、可版本追溯、无后端依赖 |

因此运行时知识库是仓库内的 JSON，按「周分片 + 索引 + 人工表」组织：

- `index.json`：周清单入口（周号、起止日、文件路径、日期、餐次数、菜品数、范围与总计）。前端启动只读它
- `weeks/YYYY-Www.json`：一周一个文件装该周全部「日期 × 餐次」食谱。前端按需加载
- `dish-catalog.json`：按菜名归一化的菜品知识库，同名菜的不同配方各占一个 `variantId`，`variants[]` 全量保留
- `ingredient-index.json`：食材反查索引（规范名 → 写法、命中菜名/变体/日期）
- `ingredient-aliases.json`：人工维护的食材同物异写合并表
- `dish-meta.json`：人工维护的菜品字段（别名、替餐、主配方口径、verified）
- `substitute-library.json`：动态替餐配方库（替换过敏原、适用菜品、营养标签、确认状态）
- `settings.json`：幼儿园信息和补剂项
- `allergens.json` / `substitutes.json`：风险词库与旧版替餐回退

前端只读这些 JSON，不做识别也不写回。Agent 在本地维护并 Git 提交。

## 目录

```text
leleat/
├── public/
│   └── assets/
│       ├── images/                 # 食谱原图 / 日列裁剪图
│       └── data/
│           ├── index.json          # 周清单入口（前端启动只读这个）
│           ├── weeks/              # 一周一个文件：2026-W42.json …
│           ├── dish-catalog.json   # 菜品知识库（按变体）
│           ├── ingredient-index.json   # 食材反查索引
│           ├── ingredient-aliases.json # 人工同物异写合并表
│           ├── dish-meta.json      # 人工字段：别名、替餐、主配方口径、verified
│           ├── substitute-library.json # 动态替餐库
│           ├── settings.json       # 学校信息、7 天补剂项
│           ├── allergens.json
│           └── substitutes.json    # 旧版全局回退
├── scripts/
│   ├── split-recipes.mjs           # 一次性迁移：单体 recipes.json → index.json + weeks/
│   ├── build-dish-catalog.mjs      # 从 weeks/*.json 重建菜品库与食材索引
│   ├── sync-variant-ids.mjs        # 按菜名别名重算 weeks/ 里派生的 variantId
│   └── lib/                        # variant / data-files / date 公共库
├── src/
│   ├── components/
│   │   ├── DayView.vue
│   │   ├── WeekView.vue
│   │   ├── WeekStrip.vue
│   │   ├── MealCard.vue
│   │   ├── RiskBadge.vue
│   │   ├── TraceDialog.vue
│   │   ├── PrintSheet.vue
│   │   ├── ExportDialog.vue
│   │   ├── ExportPanel.vue
│   │   └── ImageLightbox.vue
│   ├── utils/
│   │   ├── dataLoader.ts
│   │   ├── exportDocx.ts
│   │   ├── exportCsv.ts
│   │   ├── date.ts
│   │   └── menu.ts
│   ├── types/index.ts
│   ├── App.vue
│   ├── main.ts
│   └── style.css
├── agent/
│   ├── README.md
│   ├── images.md
│   ├── recognition.md
│   ├── allergen-substitute.md
│   ├── data-merge.md
│   ├── publish.md
│   ├── acceptance.md
│   ├── schemas/week-menu.schema.json
│   ├── schemas/week-index.schema.json
│   ├── schemas/week-file.schema.json
│   ├── schemas/dish-catalog.schema.json
│   ├── schemas/ingredient-index.schema.json
│   ├── schemas/ingredient-aliases.schema.json
│   ├── schemas/dish-meta.schema.json
│   ├── schemas/substitute-library.schema.json
│   └── prompts/extract-week-menu.md
├── docs/samples/leleat-2026-W45-sample.docx
├── AGENTS.md
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── package.json
├── requirements.txt            # Python 管理端依赖（项目级 .venv，不提交虚拟环境）
└── README.md
```

## 数据 Schema

### settings.json

```json
{
  "updatedAt": "2026-11-05T09:20:00+08:00",
  "schoolName": "XX幼儿园",
  "supplements": ["AD", "VD", "五维口服液", "益生菌"]
}
```

补剂固定打印周一至周日 7 天，每项一行；食谱只取周一至周五。

### index.json

周清单入口。前端启动只读这一个文件就能渲染周选项与数据范围，不必先下载全部周文件：

```json
{
  "updatedAt": "2026-11-13T17:01:53+08:00",
  "weeks": [
    {
      "week": "2026-W42",
      "startDate": "2026-10-12",
      "endDate": "2026-10-18",
      "file": "weeks/2026-W42.json",
      "dates": ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"],
      "meals": 20,
      "dishes": 53
    }
  ],
  "range": { "startDate": "2026-10-12", "endDate": "2026-11-20" },
  "total": { "weeks": 5, "dates": 25, "meals": 100, "dishes": 263 }
}
```

周条目字段：

| 字段 | 说明 |
| --- | --- |
| `week` | ISO 周，如 `2026-W42` |
| `startDate` / `endDate` | 该周周一 / 周日 |
| `file` | 相对 `assets/data/` 的周文件路径 |
| `dates` | 本周实际有食谱的日期（工作日） |
| `meals` / `dishes` | 该周餐次数 / 菜品数，用于概览与校验 |

Schema：[week-index.schema.json](agent/schemas/week-index.schema.json)。

### weeks/YYYY-Www.json

一周一个文件，结构：

```json
{
  "week": "2026-W42",
  "startDate": "2026-10-12",
  "endDate": "2026-10-18",
  "updatedAt": "2026-11-13T17:01:53+08:00",
  "recipes": []
}
```

`recipes` 每条记录字段：

| 字段 | 说明 |
| --- | --- |
| `date` | `YYYY-MM-DD`，与 `week` 对应 |
| `week` | ISO 周，如 `2026-W42` |
| `mealPeriod` | `breakfast` / `morningSnack` / `lunch` / `afternoonTea` / `dinner` |
| `mealLabel` | 展示名称，如早餐、早点、午餐、午点 |
| `dishes` | 菜品数组 |
| `sourceImage` | 可选，仓库内图片相对路径 |
| `note` | 可选备注 |

菜品字段：

| 字段 | 说明 |
| --- | --- |
| `name` | 菜名 |
| `ingredients` | 识别食材字符串数组 |
| `riskAllergens` | 过敏原 id，对应 `allergens.json` |
| `substitute` | 菜品专属替餐；`null` 时使用全局替餐表 |
| `variantId` | 配方变体 id，`菜名#8位hex`，由菜名与排序后食材内容寻址生成 |
| `calorie` / `noteForKindergarten` / `verified` | 预留字段 |

Schema：[week-file.schema.json](agent/schemas/week-file.schema.json)。

### dish-catalog.json

同名菜的不同配方各占一个 `variantId`，`variants[]` 把历史配方全量保留；顶层 `ingredients` / `riskAllergens` 是**主配方**的语义，不是并集。默认口径是「最近一次出现的那版为准」（`dish-meta.json` 的 `reviewPolicy.mode = "latest"`），换配方时库里自动跟进，历史版本仍留在 `variants[]`：

```json
{
  "updatedAt": "2026-11-13T10:51:46.923Z",
  "dishes": {
    "豆沙卷": {
      "name": "豆沙卷",
      "aliases": [],
      "ingredients": ["豆沙", "面粉", "奶粉"],
      "riskAllergens": ["milk"],
      "substitute": null,
      "firstSeen": "2026-10-23",
      "lastSeen": "2026-11-20",
      "occurrences": [
        { "date": "2026-10-23", "mealPeriod": "afternoonTea", "variantId": "豆沙卷#ca30d511" },
        { "date": "2026-11-03", "mealPeriod": "afternoonTea", "variantId": "豆沙卷#b1f878fd" }
      ],
      "sourceImages": [],
      "variants": [
        {
          "variantId": "豆沙卷#ca30d511",
          "ingredients": ["豆沙", "面粉", "奶粉"],
          "riskAllergens": ["milk"],
          "count": 2,
          "firstSeen": "2026-10-23",
          "lastSeen": "2026-11-20"
        },
        {
          "variantId": "豆沙卷#b1f878fd",
          "ingredients": ["白糖", "红豆", "面粉"],
          "riskAllergens": [],
          "count": 1,
          "firstSeen": "2026-11-03",
          "lastSeen": "2026-11-03"
        }
      ],
      "primaryVariantId": "豆沙卷#ca30d511",
      "primaryBasis": "latest"
    }
  }
}
```

生成/重建：

```bash
npm run sync-variants   # 仅在改过 dish-meta.json 的菜名别名后需要
npm run catalog
```

脚本从 `weeks/*.json` 全量重建 catalog 与 `ingredient-index.json`：同一 `variantId` 合并计数与时间范围，`variants` 按出现次数降序。主配方按 `dish-meta.json` 的 `reviewPolicy.mode` 选：`latest`（默认）取最近一次出现的那版并记 `primaryBasis: "latest"`；改成 `frequency` 才按出现次数取，并给多配方菜标 `needsReview: true` 进人工复核。单个菜可用 `dishes.<菜名>.primaryVariant` 钉住某个 `variantId`。人工字段（`aliases`、`substitute`、`primaryVariant`、`verified`）来自 `dish-meta.json`，重建不会覆盖。无论口径怎么变，历史配方都留在 `variants[]` 里，不删除。机器可读 Schema：[agent/schemas/dish-catalog.schema.json](agent/schemas/dish-catalog.schema.json)。

### ingredient-index.json / ingredient-aliases.json

```json
{
  "updatedAt": "2026-11-13T10:51:46.923Z",
  "note": "食材索引：按规范食材名聚合；hits 指回菜名与变体，form 只在写法与规范名不同时出现。",
  "total": { "ingredients": 134, "hits": 610, "dishes": 145, "variants": 156 },
  "ingredients": {
    "鹌鹑蛋": {
      "forms": ["鹌鹑蛋"],
      "dishCount": 3,
      "hitCount": 4,
      "firstSeen": "2026-10-13",
      "lastSeen": "2026-11-16",
      "dishes": ["鹌鹑蛋", "水煮鹌鹑蛋", "鲜肉鸟巢蒸蛋"],
      "hits": [
        { "dish": "鹌鹑蛋", "variantId": "鹌鹑蛋#de1622e0", "date": "2026-10-19", "mealPeriod": "breakfast" }
      ]
    }
  }
}
```

同物异写由人工表 `ingredient-aliases.json` 归并（key 为规范名，values 为各写法，至少含规范名自身）：

```json
{
  "note": "人工维护的同物异写合并表。",
  "groups": {
    "牛奶": ["牛奶", "纯牛奶"],
    "胡萝卜": ["胡萝卜", "红萝卜"],
    "山楂": ["山楂", "山楂条", "山楂片"]
  }
}
```

Schema：[ingredient-index.schema.json](agent/schemas/ingredient-index.schema.json)、[ingredient-aliases.schema.json](agent/schemas/ingredient-aliases.schema.json)。

### dish-meta.json

人工维护的菜品字段，重建 catalog 时合并进来：

```json
{
  "reviewPolicy": { "mode": "latest" },
  "dishes": {
    "米饭": { "aliases": ["香米饭", "水晶米饭", "金银米饭", "黄金米饭", "燕麦香米饭"] },
    "纯牛奶": { "aliases": ["牛奶"], "substitute": "米奶" }
  }
}
```

`aliases` 是「同一道菜的其它写法」：登记后主配方、变体池、出现记录与食材索引都归并到规范菜名，`catalog` 只出一条（米饭 19 次、山楂 3 次、鹌鹑蛋 3 次）。`weeks/*.json` 里的 `dish.name` 保持原表写法不变，归并只发生在派生层。

因为 `variantId = sha1(规范菜名 | 排序后食材)`，**加完别名要依次跑 `npm run sync-variants` 与 `npm run catalog`**，否则周文件里旧的 `variantId` 对不上变体。

Schema：[dish-meta.schema.json](agent/schemas/dish-meta.schema.json)。

### substitute-library.json

```json
{
  "recipes": [
    {
      "id": "sub-egg-steamed-tofu-pork",
      "name": "肉末蒸豆腐",
      "replaces": ["egg"],
      "ingredients": ["嫩豆腐", "瘦肉末", "小葱"],
      "usedFor": ["肉沫蒸滑蛋", "蒸蛋羹", "肉沫蒸水蛋"],
      "tags": ["蛋白质", "钙", "软食"],
      "verified": true,
      "priority": 100
    }
  ]
}
```

选择规则：先匹配过敏原是否被完全覆盖，再优先 `usedFor` 精确命中菜名，然后看 `verified` 和 `priority`；同一餐内不重复使用同一个替餐。页面展示候选和营养标签，DOCX/打印只显示已确认的菜品专属替餐。Schema：[substitute-library.schema.json](agent/schemas/substitute-library.schema.json)。

### allergens.json / substitutes.json

```json
[
  { "id": "egg", "name": "鸡蛋", "keywords": ["蛋", "鸡蛋", "蒸蛋"] }
]
```

```json
{
  "鸡蛋": ["瘦猪肉末", "嫩豆腐", "鹰嘴豆泥"],
  "牛奶": ["燕麦奶", "无糖豆浆", "椰奶"]
}
```

替餐优先级：

1. `dish.substitute` 菜品专属；
2. 动态替餐库 `substitute-library.json`；
3. 旧版 `substitutes.json` 全局回退；
4. 都没有时显示“暂无推荐替餐，请与幼儿园确认。”

打印只使用已确认的菜品专属替餐，不把未确认的候选打印成定稿。

风险判定完全由 Agent 预先完成，前端不会根据食材文本重新判断。

## Agent 识别与知识库规范

前端不做识别。仓库外 Agent 直接调用 DeepSeek 多模态模型识别周表，不使用 OCR，并按 [AGENTS.md](AGENTS.md) 与其 [agent/](agent/README.md) 明细规范维护 `weeks/*.json`、`index.json`、`dish-catalog.json` 与 `substitute-library.json`。

**前端只读**：启动时只加载 `index.json` 建周选项，选中哪周才按 `file` 字段按需加载 `weeks/YYYY-Www.json`，不下载全部周数据。菜品知识库与食材索引也只在需要的视图里拉取。

- 周表识别 Schema：[week-menu.schema.json](agent/schemas/week-menu.schema.json)
- 周清单 Schema：[week-index.schema.json](agent/schemas/week-index.schema.json)
- 周文件 Schema：[week-file.schema.json](agent/schemas/week-file.schema.json)
- 菜品库 Schema：[dish-catalog.schema.json](agent/schemas/dish-catalog.schema.json)
- 食材索引 Schema：[ingredient-index.schema.json](agent/schemas/ingredient-index.schema.json)
- 替餐库 Schema：[substitute-library.schema.json](agent/schemas/substitute-library.schema.json)
- DeepSeek 视觉抽取 Prompt：[extract-week-menu.md](agent/prompts/extract-week-menu.md)

核心原则：图片只进 Agent，前端只读 JSON；识别结果先算 `variantId` 再与菜品/食材库比对，新菜追加、同变体复用、新配方作为新变体追加并保留历史（默认口径下主配方自动切到最新这版，不标 `needsReview`）。重建必须幂等并保护人工确认字段。

## 本地存储

只保存视图偏好：

```text
leleat:selected-date
leleat:view-mode
```

不缓存食谱数据、图片或个人信息。

## Word 文档怎么生成

Word **不在管理端预生成，也不是模板占位符替换**。流程是：

1. 管理端用 DeepSeek 多模态识别 → 合并 JSON → 提交 Git。
2. GitHub Pages 加载最新 JSON。
3. 用户点“下载 DOCX”时，浏览器用 `docx` 包按当前数据实时生成。

这样文档不会和 JSON 不同步，也不用把二进制 Word 提交进仓库。`docx` 生成代码就是版式模板；管理端只负责数据和图片。当前 [样例 DOCX](docs/samples/leleat-2026-W45-sample.docx) 只用于验收，不是运行时数据源。

## 打印与导出

- **在线打印**：A4 横向；当前周的周一至周五食谱 + 周一至周日补剂清单；打印时隐藏所有按钮和弹窗。
- **DOCX**：A4 横向周表，红色显示风险菜品，括号内只打印已确认的菜品专属替餐；补剂表 7 天、每项一行、每格一个勾选框。跨多周时每周单独一页。
- **CSV**：风险菜品替餐明细，UTF-8 BOM。
- 样例：[leleat-2026-W45-sample.docx](docs/samples/leleat-2026-W45-sample.docx)。

## 错误边界

- 食谱、过敏原或替餐 JSON 拉取失败：页面显示错误与重新加载按钮
- `index.json` 拉取失败：无法建周选项，整页显示错误与重新加载按钮
- 单个周文件拉取失败：只影响该周，切到其他周仍可用
- `settings.json` / `dish-catalog.json` 缺失或损坏：使用内置补剂默认值和空知识库，不阻塞食谱展示
- `substitute-library.json` 缺失或损坏：回退旧版 `substitutes.json` 全局映射
- 单条食谱字段不合法、日期与 ISO 周不一致：控制台警告并跳过该条
- 图片不存在：静默隐藏，不阻塞页面
- localStorage 不可用：静默降级，只影响偏好记忆

## 示例数据

仓库内置五张真实周表对应的数据：`2026-W42`（10/12–10/16）、`2026-W43`（10/19–10/23）、`2026-W45`（11/2–11/6）、`2026-W46`（11/9–11/13）、`2026-W47`（11/16–11/20），共 25 天、100 条餐次记录、263 条菜品出现记录、145 道菜（156 个配方变体）。数据入口是 `public/assets/data/index.json`，每周正文在 `public/assets/data/weeks/` 下。菜品名、食材和每日餐次逐项来自这些原图；原图保存在 `public/assets/images/*-week-menu.jpg`，每日裁图保存在 `public/assets/images/YYYYMMDD-menu.jpg`。

过敏原标记按 `allergens.json` 的当前关键词从原图食材中确定性匹配；`substitute` 只写入已确认的替餐（当前周来自你提供的 DOCX），其余交给动态替餐库。

## 扩展预留

前端忽略未知字段。后续可继续增加按过敏原筛选、月视图、汇总报表、替餐历史统计和分页打印；只要 Agent 写入 JSON，前端无需改动存储层。
