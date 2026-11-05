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
npm run catalog     # 从 recipes.json 重新生成/合并菜品知识库
npm run deploy      # 构建并发布 gh-pages 分支
```

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

因此运行时知识库是仓库内的 JSON：

- `recipes.json`：按日期和餐次固化的周食谱（增量追加/合并）
- `dish-catalog.json`：按菜名归一化的菜品知识库（食材、过敏原、替餐、出现历史）
- `substitute-library.json`：动态替餐配方库（替换过敏原、适用菜品、营养标签、确认状态）
- `settings.json`：幼儿园信息和补剂项
- `allergens.json` / `substitutes.json`：风险词库与旧版替餐回退

前端只读这些 JSON。Agent 在本地维护并 Git 提交，不在浏览器里写回。

## 目录

```text
leleat/
├── public/
│   └── assets/
│       ├── images/                 # 食谱原图 / 日列裁剪图
│       └── data/
│           ├── recipes.json        # 周食谱
│           ├── dish-catalog.json   # 菜品知识库
│           ├── substitute-library.json # 动态替餐库
│           ├── settings.json       # 学校信息、7 天补剂项
│           ├── allergens.json
│           └── substitutes.json    # 旧版全局回退
├── scripts/
│   └── build-dish-catalog.mjs      # 从食谱生成/合并菜品库
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
│   ├── schemas/week-menu.schema.json
│   ├── schemas/dish-catalog.schema.json
│   ├── schemas/substitute-library.schema.json
│   └── prompts/extract-week-menu.md
├── docs/samples/leleat-2026-W45-sample.docx
├── AGENT_SPEC.md
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── package.json
└── README.md
```

## 数据 Schema

### settings.json

```json
{
  "updatedAt": "2026-11-05T09:20:00+08:00",
  "schoolName": "乐乐幼儿园",
  "supplements": ["AD", "VD", "五维口服液", "益生菌"]
}
```

补剂固定打印周一至周日 7 天，每项一行；食谱只取周一至周五。

### recipes.json

支持裸数组或带 `updatedAt` 的对象格式：

```json
{
  "updatedAt": "2026-11-05T09:20:00+08:00",
  "recipes": []
}
```

每条记录字段：

| 字段 | 说明 |
| --- | --- |
| `date` | `YYYY-MM-DD`，与 `week` 对应 |
| `week` | ISO 周，如 `2026-W45` |
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
| `calorie` / `noteForKindergarten` / `verified` | 预留字段 |

### dish-catalog.json

```json
{
  "updatedAt": "2026-11-05T09:20:00+08:00",
  "dishes": {
    "番茄炖牛腩": {
      "name": "番茄炖牛腩",
      "aliases": [],
      "ingredients": ["番茄", "牛腩"],
      "riskAllergens": [],
      "substitute": null,
      "firstSeen": "2026-11-02",
      "lastSeen": "2026-11-02",
      "occurrences": [
        {
          "date": "2026-11-02",
          "week": "2026-W45",
          "mealPeriod": "lunch",
          "mealLabel": "午餐"
        }
      ],
      "sourceImages": []
    }
  }
}
```

生成/合并：

```bash
npm run catalog
```

脚本会保留已有的 `aliases`、`substitute`、`verified`，对同名菜追加 occurrence，不覆盖人工字段。机器可读 Schema：[agent/schemas/dish-catalog.schema.json](agent/schemas/dish-catalog.schema.json)。

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

前端不做识别。仓库外 Agent 直接调用 DeepSeek 多模态模型识别周表，不使用 OCR，并按 [AGENT_SPEC.md](AGENT_SPEC.md) 增量维护 `recipes.json`、`dish-catalog.json` 与 `substitute-library.json`。

- 周表识别 Schema：[week-menu.schema.json](agent/schemas/week-menu.schema.json)
- 菜品库 Schema：[dish-catalog.schema.json](agent/schemas/dish-catalog.schema.json)
- 替餐库 Schema：[substitute-library.schema.json](agent/schemas/substitute-library.schema.json)
- DeepSeek 视觉抽取 Prompt：[extract-week-menu.md](agent/prompts/extract-week-menu.md)

核心原则：图片只进 Agent，前端只读 JSON；识别结果先与菜品/食材库比对，新菜追加、旧菜复用、冲突进人工复核。知识库可持续追加，但合并必须幂等并保护人工确认字段。

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
- `settings.json` / `dish-catalog.json` 缺失或损坏：使用内置补剂默认值和空知识库，不阻塞食谱展示
- `substitute-library.json` 缺失或损坏：回退旧版 `substitutes.json` 全局映射
- 单条食谱字段不合法、日期与 ISO 周不一致：控制台警告并跳过该条
- 图片不存在：静默隐藏，不阻塞页面
- localStorage 不可用：静默降级，只影响偏好记忆

## 示例数据

仓库内置三张真实周表对应的数据：`2026-W42`（10/12–10/16）、`2026-W43`（10/19–10/23）、`2026-W45`（11/2–11/6），共 60 条餐次记录、159 条菜品出现记录。菜品名、食材和每日餐次逐项来自这三张原图；原图保存在 `public/assets/images/*-week-menu.jpg`，每日裁图保存在 `public/assets/images/YYYYMMDD-menu.jpg`。

过敏原标记按 `allergens.json` 的当前关键词从原图食材中确定性匹配；`substitute` 只写入已确认的替餐（当前周来自你提供的 DOCX），其余交给动态替餐库。

## 扩展预留

前端忽略未知字段。后续可继续增加按过敏原筛选、月视图、汇总报表、替餐历史统计和分页打印；只要 Agent 写入 JSON，前端无需改动存储层。
