# Leleat｜乐乐食谱替餐助手

面向幼儿园食谱的纯静态日历式展示与打印站点。识别、食材抽取、过敏原标记、菜品知识库维护都在仓库外的本地 Agent 中完成；这个仓库只负责读取静态 JSON、展示、溯源、打印和导出。

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
- 导出弹窗：
  - DOCX：A4 横向周表，周一至周五 5 列，红色风险菜品 + 括号内首选替餐
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
- `settings.json`：幼儿园信息和补剂项
- `allergens.json` / `substitutes.json`：风险与替餐配置

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
│           ├── settings.json       # 学校信息、7 天补剂项
│           ├── allergens.json
│           └── substitutes.json
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
2. 按 `riskAllergens` 查 `substitutes.json`；
3. 合并多个过敏原推荐并去重；
4. 都没有时显示“暂无推荐替餐，请与幼儿园确认。”

风险判定完全由 Agent 预先完成，前端不会根据食材文本重新判断。

## Agent 识别与知识库规范

前端不做识别。仓库外 Agent 按 [AGENT_SPEC.md](AGENT_SPEC.md) 处理周表图片，并增量维护 `recipes.json` 与 `dish-catalog.json`。

- 周表识别 Schema：[week-menu.schema.json](agent/schemas/week-menu.schema.json)
- 菜品库 Schema：[dish-catalog.schema.json](agent/schemas/dish-catalog.schema.json)
- 视觉抽取 Prompt：[extract-week-menu.md](agent/prompts/extract-week-menu.md)

核心原则：图片只进 Agent，前端只读 JSON；知识库可持续追加，但合并必须幂等并保护人工确认字段。

## 本地存储

只保存视图偏好：

```text
leleat:selected-date
leleat:view-mode
```

不缓存食谱数据、图片或个人信息。

## 打印与导出

- **在线打印**：A4 横向；当前周的周一至周五食谱 + 周一至周日补剂清单；打印时隐藏所有按钮和弹窗。
- **DOCX**：A4 横向周表，红色显示风险菜品，括号内为首选替餐；补剂表 7 天、每项一行、每格一个勾选框。跨多周时每周单独一页。
- **CSV**：风险菜品替餐明细，UTF-8 BOM。
- 样例：[leleat-2026-W45-sample.docx](docs/samples/leleat-2026-W45-sample.docx)。

## 错误边界

- 食谱、过敏原或替餐 JSON 拉取失败：页面显示错误与重新加载按钮
- `settings.json` / `dish-catalog.json` 缺失或损坏：使用内置补剂默认值和空知识库，不阻塞食谱展示
- 单条食谱字段不合法、日期与 ISO 周不一致：控制台警告并跳过该条
- 图片不存在：静默隐藏，不阻塞页面
- localStorage 不可用：静默降级，只影响偏好记忆

## 示例数据

内置 `2026-W44`、`2026-W45` 两周数据，覆盖早餐、早点、午餐、午点、安全餐、鸡蛋/牛奶/双重过敏原、专属替餐、全局替餐和菜品知识库。`public/assets/images/` 中两张 SVG 是排版样例原图，不是真实幼儿园照片。

## 扩展预留

前端忽略未知字段。后续可继续增加按过敏原筛选、月视图、汇总报表、替餐历史统计和分页打印；只要 Agent 写入 JSON，前端无需改动存储层。
