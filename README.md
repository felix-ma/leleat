# Leleat｜乐乐食谱替餐助手

面向幼儿园食谱的纯静态展示与替餐导出站点。识别、食材抽取、过敏原标记和入库都在仓库外的本地 Agent 中完成；这个仓库只负责读取静态 JSON、展示风险和导出打印文档。

- 站点标题：Leleat｜乐乐食谱替餐助手
- 版本：v0.1
- 技术栈：Vite + Vue 3 + TypeScript + Tailwind CSS
- 部署：GitHub Pages（`gh-pages` 分支）
- 前端边界：**不包含图片上传、OCR、图像识别、LLM 调用、后端接口或在线编辑**

## 功能

- 默认打开最新一周，支持上一周 / 下一周 / 下拉跳转，并记住上次查看的周（仅存视图偏好）
- 按日期和餐次分组展示菜品、食材、风险标签、替餐建议和食谱原图
- 风险菜品红色标记，安全菜品绿色标记；整餐安全时显示“本餐对乐乐安全，无需替换。”
- 原图缩略图点击后可预览大图；图片失效时静默隐藏
- 当前周或自定义日期区间导出 DOCX / CSV
  - DOCX：A4 横向周表，周一至周五为列、早餐/早点/午餐/午点为行；过敏菜品红色显示，括号内为首选替餐；附每日补剂勾选栏
  - CSV：风险菜品替餐明细，UTF-8 BOM，方便 Excel 打开
- 浏览器原生打印：只输出当前浏览周的食谱与替餐表格
- 加载骨架、数据失败提示、单条食谱校验跳过
- 响应式布局，手机和电脑均可使用

## 快速开始

要求 Node.js 20+。

```bash
npm ci
npm run dev
```

由于 GitHub Pages 项目站点使用 `/leleat/` 作为 base，本地开发地址是：

```text
http://localhost:5173/leleat/
```

其他命令：

```bash
npm run typecheck   # TypeScript / Vue 类型检查
npm run build       # 类型检查 + 生成 dist/
npm run preview     # 预览构建结果，http://localhost:4173/leleat/
```

## 部署到 GitHub Pages

1. 在 GitHub 创建仓库，仓库名保持 `leleat`（与 `vite.config.ts` 的 `base: '/leleat/'` 对应）。
2. 提交代码并配置远程地址：

   ```bash
   git remote add origin git@github.com:<你的用户名>/leleat.git
   git push -u origin main
   ```

3. 部署 `dist/` 到 `gh-pages` 分支：

   ```bash
   npm run deploy
   ```

4. 打开仓库 **Settings → Pages**，Source 选择 **Deploy from a branch**，分支选 `gh-pages`，目录选 `/ (root)`。
5. 站点地址：`https://<你的用户名>.github.io/leleat/`。

`public/.nojekyll` 会随构建复制到 `dist/`，避免 GitHub Pages 的 Jekyll 处理静态资源。如果仓库名不是 `leleat`，必须同步修改 `vite.config.ts` 中的 `base`，否则线上会 404。

## 本地 Agent 识别规范

前端不做识别。仓库外的本地 Agent 按 [AGENT_SPEC.md](AGENT_SPEC.md) 处理“一周带量食谱”表格图片，机器可读 Schema 和 Prompt 在 [`agent/`](agent/) 下：

- 中间结果 Schema：[week-menu.schema.json](agent/schemas/week-menu.schema.json)
- 视觉抽取 Prompt：[extract-week-menu.md](agent/prompts/extract-week-menu.md)

## 数据与目录

```text
leleat/
├── public/
│   └── assets/
│       ├── images/                 # Agent 推送的食谱原图 / 缩略图
│       └── data/
│           ├── recipes.json        # 主食谱库（唯一数据源）
│           ├── allergens.json      # 过敏原词库
│           └── substitutes.json    # 替餐映射库
├── src/
│   ├── components/
│   │   ├── WeekMenu.vue
│   │   ├── MealCard.vue
│   │   ├── RiskBadge.vue
│   │   └── ExportPanel.vue
│   ├── utils/
│   │   ├── dataLoader.ts
│   │   ├── exportDocx.ts
│   │   └── exportCsv.ts
│   ├── types/
│   │   └── index.ts
│   ├── App.vue
│   ├── main.ts
│   └── style.css
├── agent/
│   ├── schemas/week-menu.schema.json
│   └── prompts/extract-week-menu.md
├── AGENT_SPEC.md
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── package.json
└── README.md
```

前端只读。新增或修正食谱时，由外部 Agent 修改 JSON、可选加入图片，然后 Git 提交并推送；不要在前端加入录入和写入逻辑。

### recipes.json 的两种兼容格式

PRD 的原始结构是数组；为了在页面顶部展示“数据最后更新时间”，示例文件使用了带 `updatedAt` 的对象格式。前端两种都接受：

```json
{
  "updatedAt": "2026-11-05T09:20:00+08:00",
  "recipes": []
}
```

```json
[]
```

对象格式中 `updatedAt` 可选；裸数组格式没有更新时间时，页面显示“未标注”。如果以后调整结构，需要同步修改 `src/types/index.ts` 和 `src/utils/dataLoader.ts`。

### 数据 Schema 摘要

`allergens.json`：

```json
[
  {
    "id": "egg",
    "name": "鸡蛋",
    "keywords": ["蛋", "鸡蛋", "蒸蛋", "蛋黄", "蛋清", "蛋羹"]
  }
]
```

`substitutes.json`：

```json
{
  "鸡蛋": ["瘦猪肉末", "嫩豆腐", "鹰嘴豆泥"],
  "牛奶": ["燕麦奶", "无糖豆浆", "椰奶"]
}
```

`recipes.json` 中每条记录包含：

| 字段 | 说明 |
| --- | --- |
| `date` | `YYYY-MM-DD`，必须与 `week` 对应的 ISO 周一致 |
| `week` | ISO 周，如 `2026-W45`，用于按周聚合 |
| `mealPeriod` | `breakfast` / `morningSnack` / `lunch` / `afternoonTea` / `dinner` |
| `mealLabel` | 展示用餐次名称，如“午餐” |
| `dishes` | 菜品数组 |
| `sourceImage` | 可选，仓库内静态图片路径，如 `assets/images/xxx.jpg` |
| `note` | 可选，给家长看的备注 |

菜品字段：

| 字段 | 说明 |
| --- | --- |
| `name` | 菜名 |
| `ingredients` | 已识别的食材字符串数组 |
| `riskAllergens` | 命中的过敏原 id 数组，对应 `allergens.json` |
| `substitute` | 该菜品专属替餐；为 `null` 时使用 `substitutes.json` |
| `calorie` / `noteForKindergarten` / `verified` | 预留字段，v0.1 不展示 |

风险判定由 Agent 预先完成，前端只读取 `riskAllergens`，不会根据食材文本重新判断。

### 替餐解析顺序

1. 菜品的 `substitute` 非空：优先使用，标记为“菜品专属”；
2. 否则按 `riskAllergens` 找到过敏原名称，在 `substitutes.json` 中取推荐，标记为“按过敏原推荐”；
3. 同时命中多个过敏原时合并推荐并去重；
4. 都没有时显示“暂无推荐替餐，请与幼儿园确认”。

## 示例数据

仓库内置 `2026-W44` 和 `2026-W45` 两周演示数据，覆盖早餐、早点、午餐、午点、安全餐、鸡蛋、牛奶、双重过敏原、专属替餐和全局替餐。`public/assets/images/` 下两张 SVG 是**排版样例原图**，不是真实幼儿园照片；接入时由 Agent 替换为实际图片即可。

## 错误边界

- 任意一份 JSON 拉取失败：页面显示对应错误和“重新加载”按钮；
- 单条食谱字段不合法、日期与 ISO 周不一致：控制台输出警告并跳过该条，不影响整页；
- 图片加载失败：隐藏该图片，不阻塞页面；
- localStorage 不可用：静默降级为默认最新周。

## 本地存储

仅使用一个 key：

```text
leleat:selected-week
```

只保存最近查看的周字符串，不缓存食谱数据、图片或用户信息。

## 打印与导出

- **DOCX**：`docx` 包在浏览器端生成 A4 横向周表。第一列为餐次，后面为周一至周五；每格列出当日菜品，含过敏原的菜品用红色加粗显示，并在括号中给出首选替餐。表格下方附“每日补剂”勾选栏。文件名如 `leleat-2026-W45.docx`。自定义区间跨多周时，每周单独一页。
- **CSV**：风险菜品替餐明细，列为“日期｜餐次｜菜品｜风险过敏原｜推荐替餐”，带 UTF-8 BOM，文件名如 `leleat-2026-W45.csv`。
- 可直接打开的样例：[leleat-2026-W45-sample.docx](docs/samples/leleat-2026-W45-sample.docx)。
- **浏览器打印**：当前浏览周的完整食谱与替餐表，打印时隐藏导航、按钮、图片和导出面板。

## 扩展预留

前端会忽略食谱条目中的未知字段；后续 Agent 可以安全增加 `calorie`、`noteForKindergarten`、`verified` 等字段。v0.2 可在此结构上增加按过敏原筛选、汇总报表、历史统计和分页打印控制。
