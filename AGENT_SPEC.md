# Leleat 本地 Agent 识别规范

- **版本**：1.1
- **适用输入**：幼儿园「一周带量食谱及营养分析表」图片（周一至周五、早餐/早点/中餐/午点、每格含食谱/食物/重量）
- **适用仓库**：`leleat`
- **运行位置**：仓库外的本地 Agent / 本地脚本
- **前端边界**：前端仍然只读 `public/assets/data/*.json`，不做 OCR、不调用视觉模型、不写仓库。

> 本次先交付规范、机器可读 Schema 和 Prompt，不提供可执行的视觉模型调用代码。Agent 可按下面的 CLI 契约实现。

---

## 1. 目标与非目标

### 目标

1. 从一张周表图片中提取 5 个工作日、每天 4 个餐次、每个餐次的菜品和食材克重。
2. 生成可校验的中间结果，保留原始文字、置信度和低置信警告。
3. 根据 `allergens.json` 做确定性过敏原标记；根据 `substitutes.json` 或已确认的菜品专属替餐给出建议。
4. 安全地合并进 `public/assets/data/recipes.json`，并增量维护 `dish-catalog.json`，保护人工确认过的字段。
5. 产出可追溯的 Git 提交，可选推送。

### 非目标

- 不在浏览器端做识别。
- 不在本仓库中保存视觉模型 API Key。
- 不自动编造未出现在图片中的菜名、食材、克重或营养数据。
- 不用图片中的“周次”直接当 ISO 周。
- 不自动修改前端代码或布局。

---

## 2. 目标输入版式

根据两张样例和 `食谱(1).docx`，识别器必须适配以下结构：

```text
单位：某幼儿园
标题：一周带量食谱及营养分析表        一人可食均量:克
日期范围：2026年10月12日 - 2026年10月16日        周次：7

┌──────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ 餐名(用餐时间) │ 星期一    │ 星期二    │ 星期三    │ 星期四    │ 星期五    │
│              │ 2026.10.12│ 2026.10.13│ 2026.10.14│ 2026.10.15│ 2026.10.16│
│              │ 食谱|食物|重量│ 食谱|食物|重量│ ...       │ ...       │ ...       │
├──────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ 早餐(8:30)    │ ...      │ ...      │ ...      │ ...      │ ...      │
│ 早点(10:00)   │ ...      │ ...      │ ...      │ ...      │ ...      │
│ 中餐(11:30)   │ ...      │ ...      │ ...      │ ...      │ ...      │
│ 午点(15:00)   │ ...      │ ...      │ ...      │ ...      │ ...      │
└──────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

### 关键观察

- 每个星期列内部有 3 个子列：`食谱`、`食物`、`重量`。
- 同一单元格可以有多道菜；每道菜下方跟着若干食材行。
- 有些菜品名称会跨两行，有些空行用于分隔菜品。
- 部分单元格存在纵向合并；早餐、早点、午点通常分为两小行，午餐可能是合并的大格。
- 日期在星期标题中，格式多为 `2026.10.12`，需转换为 `2026-10-12`。
- 图片上的 `周次：7/8` 是**学期周**；例如 2026-10-12 所在周是 ISO `2026-W42`，两者不能混用。
- 重量列可能为空；空值必须是 `null`，不能猜测。
- 图片标题虽含“营养分析”，但表格中通常没有热量/营养素数据；不要生成这些字段。

---

## 3. 识别流水线

```text
读取图片
  → 计算 sha256，建立缓存
  → 检测表格外框/横线/竖线，切出 5 个日期列 × 4 个餐次行
  → 整页识别元信息：单位、日期范围、周次、单位“克”
  → 逐格识别：菜名、食材、重量、置信度
  → 日期/IsoWeek 归一化
  → 过敏原确定性匹配
  → 替餐匹配
  → 中间 JSON + review.md
  → 人工复核（低于阈值时阻断）
  → 投影为 recipes.json
  → 合并、校验、diff
  → git commit / 可选 push
```

### 3.1 预处理

- 自动旋转/纠偏，保证表格横平竖直。
- 放大到至少 1600px 宽；对比度增强；可选灰度化。
- 表格线检测优先使用 OpenCV（水平/垂直形态学），不要只依赖视觉模型猜列。
- 如果线检测失败，再退回整页视觉模型，并把结果标记为 `LOW_CONFIDENCE`。
- 保存每个单元格的裁剪图，供人工复核。

### 3.2 两次识别

1. **整页元信息**：标题、单位、日期范围、印刷周次、重量单位、5 个日期列。
2. **逐格识别**：对 5×4=20 个单元格分别识别，避免同一次调用里遗漏跨行菜名。

逐格识别更慢，但对低分辨率表格更稳。允许将同一餐次行的 5 个单元格合并成一次调用，前提是输出仍是按日期分开的结构。

### 3.3 视觉模型要求

- 使用支持中文表格和 JSON structured output 的视觉模型。
- 必须提供 `agent/schemas/week-menu.schema.json` 约束输出。
- 推荐两步：先输出结构化 JSON，再用确定性代码校验日期、列数、餐次数；不要让模型自己“修正”无法辨认的字符。
- 同一图片 + 同一 prompt 版本的结果应缓存，避免重复计费。

Prompt：[`agent/prompts/extract-week-menu.md`](agent/prompts/extract-week-menu.md)  
中间结果 Schema：[`agent/schemas/week-menu.schema.json`](agent/schemas/week-menu.schema.json)

---

## 4. 中间结果

中间结果保存在仓库外，例如 `.agent-out/<week>/extraction.json`。不要提交到 Git。

### 4.1 顶层结构

```json
{
  "schemaVersion": "1.0",
  "source": {
    "image": "/path/to/menu.jpg",
    "sha256": "…",
    "school": "XX幼儿园",
    "title": "一周带量食谱及营养分析表",
    "printedWeekNumber": 7,
    "dateRange": { "start": "2026-10-12", "end": "2026-10-16" },
    "unit": "克",
    "ocrEngine": "…",
    "promptVersion": "week-menu-v1",
    "confidence": 0.96
  },
  "days": [],
  "warnings": []
}
```

### 4.2 日期与餐次

每天固定 4 个餐次：

| 图片文字 | `slot` | `label` | 时间 |
| --- | --- | --- | --- |
| 早餐 | `breakfast` | 早餐 | 08:30 |
| 早点 | `morningSnack` | 早点 | 10:00 |
| 中餐 | `lunch` | 午餐 | 11:30 |
| 午点 | `afternoonTea` | 午点 | 15:00 |

当前前端已经支持 `morningSnack`，所以不要再把早点合并进早餐。

`isoWeek` 必须由日期计算：

```python
from datetime import date
def iso_week(iso_date: str) -> str:
    year, week, _ = date.fromisoformat(iso_date).isocalendar()
    return f"{year}-W{week:02d}"
```

例如：

- 2026-10-12 至 2026-10-16 → `2026-W42`；图片上印刷周次是 7。
- 2026-10-19 至 2026-10-23 → `2026-W43`；图片上印刷周次是 8。

### 4.3 菜品与食材

```json
{
  "name": "紫菜瘦肉云吞面",
  "ingredients": [
    { "name": "紫菜", "weightG": null, "rawWeight": null },
    { "name": "瘦肉", "weightG": null, "rawWeight": null },
    { "name": "面粉", "weightG": null, "rawWeight": null },
    { "name": "蛋黄面", "weightG": null, "rawWeight": null }
  ],
  "sourceText": "紫菜瘦肉云吞面 紫菜 瘦肉 面粉 蛋黄面",
  "confidence": 0.95
}
```

规则：

- `name` 必须是图片上的菜名，不要改写为更“规范”的菜名。
- 多道菜按从上到下顺序拆分。
- 食材行归属最近的菜名，直到出现下一个菜名。
- 重量统一转克；`rawWeight` 保留原文字符串；无重量时两者都置空。
- 同一食材重复出现时保留原行，除非完全重复且无信息损失。
- 如果括号里是替餐（例如 `肉沫蒸滑蛋（肉末蒸豆腐）`），原菜名保留在 `name`，替餐部分不能变成新的食材或菜品；在 `sourceText` 保留原文，后续人工确认替餐。
- 纯图片识别阶段不写 `riskAllergens`、`substitute`、`calorie`。

---

## 5. 过敏原标记

这是识别后的**确定性步骤**，不要让视觉模型自由发挥。

### 5.1 输入

- `public/assets/data/allergens.json` 中的 `id`、`name`、`keywords`。
- 菜品名称 + 食材名称。
- 人工维护的别名/反例表（建议放 `agent/allergen_aliases.json`）。

### 5.2 匹配规则

1. 将菜名与每个食材名做去空白、去标点后的匹配。
2. 对每个过敏原使用长词优先：`酸牛奶` 先于 `牛奶`，`蛋黄酱` 先于 `蛋黄`。
3. 只输出 `allergens.json` 中存在的 id。
4. 命中即标记；存在歧义时同时标记并写入 `UNKNOWN_ALLERGEN` 或低置信警告，交人工确认。
5. 不要使用单个泛化字 `奶` 做匹配，否则会把 `奶白菜` 误判为牛奶。不要用 `牛` 匹配牛奶，否则会把牛肉误判。
6. 不要根据菜名类别凭空推断隐藏配料；但可以使用已审核的别名表。例如 `蛋糕` 默认含蛋，需在别名表中明确配置后才标记。

建议的扩展别名（维护在 Agent 侧，避免改动前端）：

```text
egg: 鸡蛋, 蛋, 蛋黄, 蛋清, 蛋羹, 蒸蛋, 鹌鹑蛋, 皮蛋, 蛋花, 蛋黄酱, 蛋糕, 蛋挞, 蛋面
milk: 牛奶, 鲜奶, 纯牛奶, 酸牛奶, 酸奶, 奶粉, 奶油, 芝士, 奶酪, 淡奶, 奶香, 奶黄, 炼乳
```

明确排除：`米奶`、`豆奶`、`椰奶`、`燕麦奶`、`杏仁奶`、`奶白菜`。

猫、坚果等不在当前过敏原词库中的项目，不得自行写入 `riskAllergens`。

### 5.3 输出

```json
"riskAllergens": ["egg", "milk"]
```

前端只读取这个数组，不会根据食材重新判断。因此 Agent 的这一步是安全关键路径，必须可重复、可测试。

---

## 6. 替餐匹配

### 6.1 优先级

1. 人工确认过的菜品专属替餐 → `dish.substitute`
2. 全局 `substitutes.json` 按过敏原中文名查表
3. 没有推荐 → `null`，前端显示“暂无推荐替餐”

前端展示时会把多个全局推荐去重后全部列出；DOCX 打印时使用第一个推荐作为“首选替餐”。

### 6.2 规则

- 不要用模型临时编造一个“听起来合理”的替代菜。
- 如果识别到红字括号替餐（如 `纯牛奶（米奶）`），先放入复核项；人工确认后再写 `substitute`。
- 如果同一菜品含两种过敏原，`substitute` 应是同时满足两者的明确菜品；无法确定时保持 `null`，让前端显示多个全局建议并提示确认。
- `verified: true` 的条目不允许自动修改。

---

## 7. 投影为 recipes.json

前端当前 Schema 定义在 `src/types/index.ts`，示例在 `public/assets/data/recipes.json`。

### 7.1 每个日期 + 餐次一条记录

```json
{
  "date": "2026-10-12",
  "week": "2026-W42",
  "mealPeriod": "breakfast",
  "mealLabel": "早餐",
  "dishes": [
    {
      "name": "紫菜瘦肉云吞面",
      "ingredients": ["紫菜", "瘦肉", "面粉", "蛋黄面"],
      "riskAllergens": ["egg"],
      "substitute": null,
      "ingredientDetails": [
        { "name": "紫菜", "weightG": null },
        { "name": "瘦肉", "weightG": null },
        { "name": "面粉", "weightG": null },
        { "name": "蛋黄面", "weightG": null }
      ]
    }
  ],
  "note": "来源：一周带量食谱 / 早餐 08:30",
  "sourceImage": "assets/images/20261012-menu.jpg"
}
```

`ingredientDetails` 是预留扩展字段，前端会忽略，但保留在 JSON 中供未来展示克重。

### 7.2 必填映射

| 中间字段 | recipes.json |
| --- | --- |
| `date` | `date` |
| `isoWeek` | `week` |
| 早餐/早点/中餐/午点 | `breakfast` / `morningSnack` / `lunch` / `afternoonTea` |
| `label` | `mealLabel` |
| 菜名 | `dishes[].name` |
| 食材名 | `dishes[].ingredients`（字符串数组） |
| 克重 | `dishes[].ingredientDetails[].weightG` |
| 风险 id | `dishes[].riskAllergens` |
| 替餐 | `dishes[].substitute` |

### 7.3 注意

- `ingredients` 只放食材名，不要把克重拼进字符串，避免未来结构化展示和匹配困难。
- 如果希望当前前端直接看到克重，可用 `--inline-weights` 把 `瘦肉 20克` 拼入 `ingredients`；默认关闭。
- `sourceImage` 必须是相对路径，如 `assets/images/20261012-menu.jpg`，不要以 `/` 开头，也不要写 `public/`。
- 每日补剂表是导出文档的固定排版内容，不写入 `recipes.json`。
- 记录按 `date`、餐次顺序、菜品原始顺序排序。

### 7.4 顶层 updatedAt

推荐写入：

```json
{
  "updatedAt": "2026-11-05T09:20:00+08:00",
  "recipes": []
}
```

前端同时兼容裸数组格式，但 Agent 新写入时统一使用对象格式。

### 7.5 菜品知识库（增量）

知识库的运行时文件是 `public/assets/data/dish-catalog.json`，前端只读。Agent 每次识别完成后同时合并周食谱和菜品库。

不用 Markdown 或 SQLite 作为仓库内主存储的原因：

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| Markdown | 不采用 | 适合说明文档，不适合稳定 key、数组、去重和机器匹配 |
| SQLite | 不作运行时数据库 | GitHub Pages 是纯静态托管；浏览器不能安全写回 Git。SQLite 可作为 Agent 本地索引/缓存，但最终导出 JSON |
| JSON | **采用** | 可直接 fetch，Git diff 清晰，可人工审查，可版本追溯，无需后端 |

结构：

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
      "sourceImages": ["assets/images/20261102-menu.svg"]
    }
  }
}
```

合并规则：

1. 以规范化菜名为 key（去首尾空格、统一全半角、合并连续空白）。
2. 同名菜已存在：
   - 食材取并集，不删除历史食材；
   - `riskAllergens` 取并集；
   - `occurrences` 追加未出现过的 `date + mealPeriod`；
   - `firstSeen` 取更早日期，`lastSeen` 取更晚日期；
   - `sourceImages` 追加去重；
   - 保留人工维护的 `aliases`、`substitute`、`verified`。
3. 新菜：创建完整记录，`occurrences` 至少一条。
4. 同一菜名但食材明显冲突时，不覆盖，写入冲突报告，交人工确认。
5. 合并必须幂等：同一份输入运行两次，catalog 零差异。
6. `verified: true` 的菜品只允许追加 occurrence，不允许自动改食材/过敏原/替餐。

前端用知识库显示“已收录、第 N 次出现、首次/最近日期”。Schema：[`agent/schemas/dish-catalog.schema.json`](agent/schemas/dish-catalog.schema.json)。样例生成脚本：`npm run catalog`。

### 7.6 补剂配置

补剂不写入食谱条目。它是独立的 `public/assets/data/settings.json`：

```json
{
  "updatedAt": "2026-11-05T09:20:00+08:00",
  "schoolName": "乐乐幼儿园",
  "supplements": ["AD", "VD", "五维口服液", "益生菌"]
}
```

- 打印和 DOCX 固定输出周一至周日 7 天。
- 每个补剂一项一行，每格一个勾选框。
- 食谱仍只输出周一到周五 5 天。
- 修改补剂项只需改此配置，不改前端逻辑。

---

## 8. 合并策略

### 8.1 稳定键

- 记录键：`date + mealPeriod`
- 菜品键：菜名规范化后的字符串（去空格、统一全半角）
- 图片键：`sha256 + promptVersion`

### 8.2 默认行为

1. 读取现有 `recipes.json`（数组或对象格式）。
2. 对每个新条目按稳定键定位：
   - 不存在：追加。
   - 已存在：按菜品键合并。
3. 保护人工字段：
   - `substitute`
   - `verified`
   - `note`
   - `noteForKindergarten`
   - `sourceImage`
   - 未知扩展字段
4. 已有 `verified: true`：只允许新增菜品，不允许修改原菜品；冲突写入报告。
5. 不删除现有菜品；如需整周替换，显式使用 `--replace-unverified`。
6. 合并后设置新的 `updatedAt`，并对整份 JSON 重新排序。
7. 原子写入：临时文件 → 校验 → rename 覆盖。
8. 输出合并报告：新增、更新、冲突、跳过。

### 8.3 幂等

同一张图片、同一 prompt、同一份现有数据连续运行两次，`recipes.json` 应零变化。任何第二次产生的差异都说明合并逻辑不稳定，必须修复。

---

## 9. 校验与人工复核

### 9.1 硬校验（失败则不写）

- JSON Schema 通过。
- 日期范围恰好是周一到周五（节假日周需显式 `--allow-short-week`）。
- 每天 4 个餐次，日期与星期一致。
- `isoWeek` 与日期计算一致。
- `printedWeekNumber` 可以为任意整数，但不得替代 `isoWeek`。
- 菜品名非空，食材数组至少 1 项。
- 所有 `riskAllergens` id 存在于 `allergens.json`。
- `sourceImage` 指向的本地文件存在。
- 没有重复的 `date + mealPeriod`。
- `dish-catalog.json` 通过 [`agent/schemas/dish-catalog.schema.json`](agent/schemas/dish-catalog.schema.json)，菜品名唯一，occurrence 与食谱对应。
- `settings.json` 中 `supplements` 为非空字符串数组，打印固定 7 天。
- 前端 `npm run build` 通过（数据 JSON 不参与 TS 类型检查，但可做回归）。

### 9.2 软校验（警告 + 复核）

- 任一菜品 `confidence < 0.85`。
- 任一单元格 `confidence < 0.85`。
- 全部重量为 `null`。
- 菜品数量异常（如某餐为 0 道）。
- 识别到的菜名与上一个版本差异较大。
- 红字替餐与括号文本不一致。

### 9.3 人工复核

生成 `.agent-out/<week>/review.md`，包含：

- 原图与每日列裁剪图；
- 低置信度单元格；
- 日期/周次对照；
- 过敏原命中列表；
- 新旧版本 diff。

规则：

- 有硬错误或低置信度未确认时，退出码非 0，不写入 `recipes.json`。
- 人工确认后使用 `--reviewed` 才允许合并。
- `verified: true` 只能由人工确认步骤写入，Agent 不得自动设置。

---

## 10. 图片资产

建议保存：

```text
public/assets/images/
├── 20261012-week-menu.jpg   # 整周原图，压缩后归档
├── 20261012-menu.jpg        # 周一的日列裁剪，供前端 sourceImage
├── 20261013-menu.jpg
└── ...
```

- 文件名使用 `YYYYMMDD`。
- 日列裁剪比整周图更适合前端缩略图和大图查看。
- `sourceImage` 挂在每天的午餐条目上，避免同一张图在每个餐次重复显示。
- 如果只保存整周图，则只在周一午餐挂一次。
- 图片压缩：最长边不超过 1600px，JPEG 质量 78–85；单张尽量小于 1.5MB。
- 图片不存在时前端会静默隐藏，但 Agent 校验应报错。

---

## 11. Git 提交与推送

### 11.1 默认

默认只写工作区并生成报告，不自动 commit、不自动 push。

### 11.2 显式发布

```text
--commit   允许 commit
--push     允许 push（隐含 --commit）
```

前置检查：

- 当前分支为 `main`（或配置的分支）。
- 工作区没有与数据无关的未提交改动；有则中止。
- 校验和构建通过。
- 只 stage：
  - `public/assets/data/recipes.json`
  - `public/assets/data/dish-catalog.json`
  - `public/assets/data/settings.json`（仅补剂或学校信息变化时）
  - `public/assets/images/*`
  - 可选的 `updatedAt` 变更
- 不提交 `.agent-out/`、缓存、API Key、原始未脱敏日志。

提交信息：

```text
data(menu): add 2026-W43 weekly menu
data(menu): update 2026-W43 after review
```

推送流程：

1. `git pull --rebase`
2. 重新运行校验
3. `git push`
4. 冲突或 rebase 失败立即中止，不使用 force push

---

## 12. 建议 CLI 契约

本次不提供可执行脚本，以下是推荐接口，便于后续实现：

```bash
# 1. 识别，输出中间 JSON / review.md / 日列裁剪图
python agent/recognize_menu.py \
  --image ~/menu.jpg \
  --out .agent-out/2026-W43 \
  --assets public/assets/images \
  --prompt agent/prompts/extract-week-menu.md \
  --schema agent/schemas/week-menu.schema.json

# 2. 投影为 recipes 候选
python agent/project_recipes.py \
  --extraction .agent-out/2026-W43/extraction.json \
  --allergens public/assets/data/allergens.json \
  --substitutes public/assets/data/substitutes.json \
  --out .agent-out/2026-W43/recipes.patch.json

# 3. 合并，先 dry-run
python agent/merge_recipes.py \
  --current public/assets/data/recipes.json \
  --patch .agent-out/2026-W43/recipes.patch.json \
  --dry-run

# 4. 人工复核后正式写入并可提交
python agent/merge_recipes.py \
  --current public/assets/data/recipes.json \
  --patch .agent-out/2026-W43/recipes.patch.json \
  --reviewed --commit

# 5. 增量合并菜品知识库（或直接运行 npm run catalog）
python agent/merge_catalog.py \
  --recipes public/assets/data/recipes.json \
  --catalog public/assets/data/dish-catalog.json

# 6. 可选推送
python agent/publish.py --push
```

退出码建议：

- `0` 成功
- `1` 输入/配置错误
- `2` 需要人工复核
- `3` 校验失败
- `4` Git 冲突或推送失败

---

## 13. 验收样例

### 样例 A：`2026-10-12` 周表

- 日期范围：2026-10-12 至 2026-10-16
- ISO 周：`2026-W42`
- 图片印刷周次：7（不得写入 `week`）
- 5 天 × 4 餐次
- 单位：XX幼儿园
- 重量单位：克

周一早餐应至少识别出：

- `紫菜瘦肉云吞面`：紫菜、瘦肉、面粉、蛋黄面
- `卤香干`：花生、八角

周一早点：

- 苹果、香蕉

周一中餐：

- 蘑菇烩牛肉：蘑菇、牛肉、红萝卜
- 肉炒小瓜丝：瘦肉、小瓜
- 肉沫时菜：时菜、瘦肉
- 山药百合大骨汤：山药、大骨、百合
- 米饭：大米

周一午点：

- 烧麦：面粉、瘦肉、玉米粒、红萝卜
- 纯牛奶：牛奶

### 样例 B：`2026-10-19` 周表

- 日期范围：2026-10-19 至 2026-10-23
- ISO 周：`2026-W43`
- 图片印刷周次：8
- 应识别 5 天 × 4 餐次
- 不得把印刷周次 8 当作 `2026-W08`

### 验收断言

- 输出通过 JSON Schema。
- 日期连续且星期匹配。
- 每天恰好 4 个餐次。
- 菜品格不包含括号替餐（替餐需单独进入复核/字段）。
- 重量缺失为 `null`，不是 0，也不是猜测值。
- 不出现热量、营养分析、过敏原等图片中没有的字段。
- 同一输入二次运行，recipes 和 dish-catalog 均零差异。
- 合并后 `npm run build` 通过。
- 最终 DOCX 为 A4 横向周表，红色显示风险菜品，括号内为首选替餐。
- 菜单只有周一到周五 5 列；补剂表为周一至周日 7 列，每个补剂一行、每格一个勾选框。

---

## 14. 缓存、安全与边界

- 缓存目录：`.cache/leleat-agent/`，键为 `sha256 + promptVersion + schemaVersion`。
- API Key 只从环境变量读取；不写仓库、不写日志、不拼进 Prompt。
- 发送图片前确认目标视觉服务符合家庭隐私要求；优先本地模型或已批准的企业接口。
- 不把含有学校、儿童姓名等信息的完整图片贴到公开 Issue。
- 删除缓存时同时删除日列裁剪图；`public/assets/images` 中的正式资产由 Git 管理。
- 前端永远不接触原图识别链路；Agent 只通过提交 JSON 和图片影响站点。

---

## 15. 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| 1.0 | 2026-11-05 | 初版：适配一周带量食谱表格、早点餐次、克重、红字替餐、合并与 Git 流程 |
| 1.1 | 2026-11-05 | 增加菜品知识库增量合并、JSON 存储决策、settings.json 补剂配置、7 天补剂表验收 |
