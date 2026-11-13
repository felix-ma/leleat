# 数据投影、合并与校验（§7–§9）

> 本文件是 [AGENTS.md](../AGENTS.md) 的明细（§7–§9），只在做对应任务时读。

## 7. 投影为周分片（index.json + weeks/*.json）

前端当前 Schema 定义在 `src/types/index.ts`，示例在 `public/assets/data/index.json` 与 `public/assets/data/weeks/2026-W42.json`。

数据按「一周一个文件」拆分，入口是 `index.json`：

| 文件 | 作用 |
| --- | --- |
| `public/assets/data/index.json` | 周清单：`weeks[]`（周号、起止日、文件路径、日期、餐次数、菜品数）、`range`、`total`。前端启动只读它 |
| `public/assets/data/weeks/YYYY-Www.json` | 该周全部「日期 × 餐次」记录。前端按 `index.json` 的 `file` 字段按需加载 |
| `public/assets/data/dish-catalog.json` | 菜品知识库（变体口径，见 §7.5） |
| `public/assets/data/ingredient-index.json` | 食材反查索引 |

`index.json` 形如：

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

周文件形如：

```json
{
  "week": "2026-W42",
  "startDate": "2026-10-12",
  "endDate": "2026-10-18",
  "updatedAt": "2026-11-13T17:01:53+08:00",
  "recipes": []
}
```

Schema：[`agent/schemas/week-index.schema.json`](schemas/week-index.schema.json)、[`agent/schemas/week-file.schema.json`](schemas/week-file.schema.json)。

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
      "variantId": "紫菜瘦肉云吞面#acf16ae0"
    }
  ],
  "sourceImage": "assets/images/20261012-menu.jpg"
}
```

`variantId` 是配方变体的内容寻址键（见 §7.5），前端靠它把周表里的这道菜对上知识库里的具体配方。

### 7.2 必填映射

| 中间字段 | weeks/YYYY-Www.json |
| --- | --- |
| `date` | `date` |
| `isoWeek` | `week`（同时也是文件名里的周号） |
| 早餐/早点/中餐/午点 | `breakfast` / `morningSnack` / `lunch` / `afternoonTea` |
| `label` | `mealLabel` |
| 菜名 | `dishes[].name` |
| 食材名 | `dishes[].ingredients`（字符串数组） |
| 克重 | 暂不落盘（`ingredientDetails` 已不再写入，等结构化展示需求明确后再定） |
| 风险 id | `dishes[].riskAllergens` |
| 替餐 | `dishes[].substitute` |
| 菜名 + 排序后食材 | `dishes[].variantId`（由脚本算出，不手填） |

### 7.3 注意

- `ingredients` 只放食材名，不要把克重拼进字符串，避免未来结构化展示和匹配困难。
- 如果希望当前前端直接看到克重，可用 `--inline-weights` 把 `瘦肉 20克` 拼入 `ingredients`；默认关闭。
- `sourceImage` 必须是相对路径，如 `assets/images/20261012-menu.jpg`，不要以 `/` 开头，也不要写 `public/`。
- 每日补剂表是导出文档的固定排版内容，不写入周食谱文件，也不写入 `settings.json` 之外的任何数据文件。
- 记录按 `date`、餐次顺序、菜品原始顺序排序。
- 新的一周写进新文件 `weeks/YYYY-Www.json`，同时更新 `index.json` 的 `weeks[]`、`range`、`total`；不要把所有周堆回一个文件。

### 7.4 顶层 updatedAt

周文件和 `index.json` 各自写 `updatedAt`，格式为带时区的 ISO 8601：

```json
{
  "week": "2026-W42",
  "startDate": "2026-10-12",
  "endDate": "2026-10-18",
  "updatedAt": "2026-11-13T17:01:53+08:00",
  "recipes": []
}
```

`updatedAt` 只随该文件内容变化；整周重跑但零差异时不刷新时间戳，保持幂等。

### 7.5 菜品知识库（按变体重建）

知识库的运行时文件是 `public/assets/data/dish-catalog.json`，前端只读。它由 `npm run catalog`（`scripts/build-dish-catalog.mjs`）从 `weeks/*.json` **全量重建**，不做手工增量编辑；人工字段单独放在 `dish-meta.json`（见 §7.5.3）。

不用 Markdown 或 SQLite 作为仓库内主存储的原因：

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| Markdown | 不采用 | 适合说明文档，不适合稳定 key、数组、去重和机器匹配 |
| SQLite | 不作运行时数据库 | GitHub Pages 是纯静态托管；浏览器不能安全写回 Git。SQLite 可作为 Agent 本地索引/缓存，但最终导出 JSON |
| JSON | **采用** | 可直接 fetch，Git diff 清晰，可人工审查，可版本追溯，无需后端 |

核心概念是**配方变体**：同名菜在不同周可能有不同食材，这些差异不再取并集，而是各占一个 `variantId`。

- `variantId` = `菜名#` + `sha1(菜名 | 食材按 zh-CN 排序后以 / 分隔).slice(0,8)`，内容寻址，实现见 `scripts/lib/variant.mjs` 的 `variantIdFor`。食材写法不变，id 就不变；食材变了，id 自然变成另一个。
- 一道菜记录里 `variants[]` 保留它出现过的**全部**配方，历史配方永不删除，按 `count` 降序、并列时最近出现的在前。
- 顶层 `ingredients` / `riskAllergens` 是**主配方**的语义，**不是各变体的并集**。主配方由 `primaryVariantId` 指向，选择口径由 `dish-meta.json` 的 `reviewPolicy.mode` 决定：
  - `latest`（默认）：取**最近一次出现**的那版配方。园方换了做法、或本周给了新配方时，库里自动以新的为准。
  - `frequency`：取**出现次数最多**的那版配方（旧口径），并保留 `needsReview: true` 等人工复核。
  - 单条可用 `dish-meta.json` 的 `dishes.<菜名>.primaryVariant` 钉住某个 `variantId`，优先级最高，此时 `primaryBasis: "manual"`。
- 无论口径如何，**历史配方都完整保留在 `variants[]` 与 `weeks/` 里**，不删除、不改写原表；换口径只影响顶层字段和溯源弹窗里「库内主配方」的标注。
- 只有口径未定（`primaryBasis: "frequency"`）的多配方菜才带 `needsReview: true`；`latest` 口径下不再逐条标红。

结构：

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
        { "date": "2026-11-03", "mealPeriod": "afternoonTea", "variantId": "豆沙卷#b1f878fd" },
        { "date": "2026-11-20", "mealPeriod": "afternoonTea", "variantId": "豆沙卷#ca30d511" }
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

`occurrences` 只记 `{date, mealPeriod, variantId}`，`mealLabel` 由前端按 `mealPeriod` 渲染，不再落盘。

合并规则（重建口径）：

1. 以规范化菜名为 key（去首尾空格、统一全半角、合并连续空白）。
2. 统计该菜名下的每一个 `variantId`：合并同一 `variantId` 的出现次数（`count`）、取更早 `firstSeen` 与更晚 `lastSeen`、累加 `sourceImages`。
3. `variants[]` 按 `count` 降序排，并列时 `lastSeen` 更晚的在前。主配方按 `dish-meta.json` 的 `reviewPolicy.mode` 选：`latest` 取 `occurrences` 里最后一条的 `variantId`，`frequency` 取 `variants[0]`，人工钉住的 `primaryVariant` 最优先。选中的变体写进顶层 `ingredients` / `riskAllergens`，并记下 `primaryVariantId` 与 `primaryBasis`。
4. 同名菜出现第二种配方：不复用、不合并食材，新增一个变体条目。默认口径 `latest` 下主配方自动切到最新这版、不标 `needsReview`；只有园方要求以出现次数为准（`reviewPolicy.mode: "frequency"`）时才标 `needsReview: true` 进人工复核，决定是统一成一种配方还是确认这就是两道同名不同的菜（后者应考虑在 `dish-meta.json` 里加别名拆开）。
5. 新菜：创建完整记录，`variants` 至少一条，`occurrences` 至少一条。
6. 重建必须幂等：同一批 `weeks/*.json` 连跑两次，`dish-catalog.json` 与 `ingredient-index.json` 零差异。
7. `verified: true`（来自 `dish-meta.json`）的菜品只允许追加 occurrence / 变体，不允许脚本改写人工字段。

**菜名别名归并（同一道菜的多种写法）**：`香米饭 / 水晶米饭 / 金银米饭 / 黄金米饭 / 燕麦香米饭` 这类只是写法不同、其实是同一道菜时，在 `dish-meta.json` 里登记 `菜名: {aliases: [其它写法]}`，脚本会把这些写法在主配方、变体池、`occurrences`、食材索引里全部归并到规范名下，`catalog` 只出一条记录（例如「米饭」19 次、「山楂」3 次、「鹌鹑蛋」3 次）。

- `weeks/*.json` 里的 `dish.name` 永远保持原表写法，不因归并改写；归并只发生在派生层。
- `variantId` 由「规范菜名 + 排序后食材」算出，所以**加完别名必须依次跑 `npm run sync-variants` 和 `npm run catalog`**：前者重算周文件里派生的 `variantId`（只改这一个字段），后者重建 catalog 与食材索引。漏跑 `sync-variants` 会让前端按 `dish.variantId` 回查不到变体。
- 别名只用于「确实是同一道菜」的写法差异（同物异名、简称、错别字）。食材实质不同的菜（如 `炒三丁` 与 `肉炒三丁` 土豆/瘦肉 → 青瓜/鸡胸肉）加别名后仍会保留为两个变体，历史配方不会被合并掉。
- 口径模糊的大类（青菜、米面等）暂不归并，宁可贵一点也不要错并。

同一 `variantId` 下食材或过敏原不一致，说明哈希口径被破坏（脚本会打 `变体口径冲突` 警告），按 bug 处理，不要改数据糊过去。

前端用知识库显示“已收录、第 N 次出现、首次/最近日期”，并按 `variantId` 显示该次命中的配方。Schema：[`agent/schemas/dish-catalog.schema.json`](schemas/dish-catalog.schema.json)。重跑命令：`npm run catalog`。

#### 7.5.1 识别结果与知识库对比

DeepSeek 提取出菜品后，先用 `variantIdFor(菜名, 食材)` 算出变体、再查 `dish-catalog.json`，决定如何入库：

| 情况 | 处理 |
| --- | --- |
| 菜名/别名不存在 | `NEW`：新菜，创建记录与首个变体，写入发生日期、图片 |
| 菜名存在，`variantId` 已存在 | `REUSED_VARIANT`：直接复用该变体，只追加 occurrence 与 `count` |
| 菜名存在，`variantId` 是新的 | `NEW_VARIANT`：新增变体条目，历史配方保留；`latest` 口径下主配方自动切到这一版，`frequency` 口径下才标 `needsReview: true` |
| 菜名存在，同一 `variantId` 下食材细节有差异（如同一 `variantId` 的写法归并后新增/缺失食材） | `CHANGED_INGREDIENTS`：只允许发生在同一变体内；任何改变食材集合的改动都会改变 `variantId`，因此这类差异必须回查原图确认是不是识别错误 |
| 变体归属有歧义、或疑似识别错（同菜名多配方且人工无法判定） | `CONFLICT`：不覆盖，阻断自动重建，交人工确认 |
| 已 `verified` | 只允许追加 occurrence，不改食材/过敏原/替餐 |

食材比较前做归一化：去首尾空格、统一全半角、合并连续空白；有明确别名时使用别名表（如 `番茄/西红柿`）只做匹配，不改原图文字。

#### 7.5.2 食材索引

`public/assets/data/ingredient-index.json` 与 catalog 一起由 `npm run catalog` 重建：按规范食材名聚合，`hits[]` 指回 `{dish, variantId, date, mealPeriod}`，`form` 只在写法与规范名不同时出现。同物异写（`牛奶/纯牛奶`、`胡萝卜/红萝卜`、`山楂/山楂条/山楂片`）由人工表 `ingredient-aliases.json` 归并，脚本只读不改它。Schema：[`agent/schemas/ingredient-index.schema.json`](schemas/ingredient-index.schema.json)。

#### 7.5.3 人工字段

- `public/assets/data/dish-meta.json`：`{reviewPolicy: {mode: "latest" | "frequency"}, dishes: {菜名: {aliases: [], substitute?, primaryVariant?, verified?}}}`，人工维护的别名、替餐、主配方口径与确认标记。`reviewPolicy.mode` 决定同名多配方时顶层取哪一版（默认 `latest`＝最近一次出现）；`primaryVariant` 填 `variantId` 可单独钉住某道菜的主配方。重建 catalog 时合并进来，重建不会覆盖。Schema：[`agent/schemas/dish-meta.schema.json`](schemas/dish-meta.schema.json)。
- `public/assets/data/ingredient-aliases.json`：`{note, groups: {规范名: [各写法]}}`。Schema：[`agent/schemas/ingredient-aliases.schema.json`](schemas/ingredient-aliases.schema.json)。

### 7.6 补剂配置

补剂不写入食谱条目。它是独立的 `public/assets/data/settings.json`：

```json
{
  "updatedAt": "2026-11-05T09:20:00+08:00",
  "schoolName": "XX幼儿园",
  "supplements": ["AD", "VD", "五维口服液", "益生菌"]
}
```

- 打印和 DOCX 固定输出周一至周日 7 天。
- 每个补剂一项一行，每格一个勾选框。
- 食谱仍只输出周一到周五 5 天。
- 修改补剂项只需改此配置，不改前端逻辑。

### 7.7 Word 文档在哪里生成

采用**浏览器实时生成**，不是管理端预生成，也不是把一份 `.docx` 模板替换占位符。

```text
DeepSeek 识别 → Agent 合并 JSON / 图片 → git push
→ GitHub Pages 加载最新 JSON
→ 用户点击“下载 DOCX / 打印”时，浏览器用当前数据生成文档
```

原因：

- 周表结构是动态的，菜品数量、跨周页数会变化；实时生成比占位符替换可靠。
- 不需要服务器、不需要把二进制 DOCX 提交进仓库，也不会出现文档与 JSON 不同步。
- `docx` 生成代码就是版式模板；修改样式改代码，修改内容只改 JSON。
- 如需管理端本地预览，Agent 可以生成临时 DOCX，但不把预览文件作为正式数据提交。

因此：**管理端只提交 JSON 和图片；Word 文档永远由前端按当前数据实时生成。**

---

## 8. 合并策略

### 8.1 稳定键

- 周文件：`week`（`YYYY-Www`），文件名与 `index.json` 的 `file` 字段必须一致
- 记录键：`date + mealPeriod`
- 菜品键：菜名规范化后的字符串（去空格、统一全半角）+ `variantId`
- 图片键：`sha256 + promptVersion`

### 8.2 默认行为

1. 读取目标周文件 `public/assets/data/weeks/YYYY-Www.json`（不存在则新建，并登记进 `index.json`）。
2. 对每个新条目按稳定键定位：
   - 不存在：追加。
   - 已存在：按菜品键合并，并用 `variantIdFor` 复核变体归属。
3. 保护人工字段：
   - `substitute`
   - `verified`
   - `note`
   - `noteForKindergarten`
   - `sourceImage`
   - 未知扩展字段
4. 已有 `verified: true`：只允许新增菜品，不允许修改原菜品；冲突写入报告。
5. 不删除现有菜品；如需整周替换，显式使用 `--replace-unverified`。
6. 合并后设置该周文件的 `updatedAt`，重新计算 `index.json` 的 `weeks[]`（`dates`/`meals`/`dishes`）、`range`、`total`，并对整份 JSON 重新排序。
7. 原子写入：临时文件 → 校验 → rename 覆盖。
8. 输出合并报告：新增、更新、冲突、跳过。

### 8.3 幂等

同一张图片、同一 prompt、同一份现有数据连续运行两次，受影响的 `weeks/YYYY-Www.json`、`index.json`、`dish-catalog.json`、`ingredient-index.json` 都应零变化（含 `updatedAt` 不刷新）。任何第二次产生的差异都说明合并逻辑不稳定，必须修复。

---

## 9. 校验与人工复核

### 9.1 硬校验（失败则不写）

- JSON Schema 通过：[`week-index.schema.json`](schemas/week-index.schema.json)、[`week-file.schema.json`](schemas/week-file.schema.json)、[`dish-catalog.schema.json`](schemas/dish-catalog.schema.json)、[`ingredient-index.schema.json`](schemas/ingredient-index.schema.json)、[`dish-meta.schema.json`](schemas/dish-meta.schema.json)、[`ingredient-aliases.schema.json`](schemas/ingredient-aliases.schema.json)。
- 日期范围恰好是周一到周五（节假日周需显式 `--allow-short-week`）。
- 每天 4 个餐次，日期与星期一致。
- `isoWeek` 与日期计算一致；周文件名、`index.json.weeks[].week`、周文件内 `week` 三者相同。
- `printedWeekNumber` 可以为任意整数，但不得替代 `isoWeek`。
- 菜品名非空，食材数组至少 1 项。
- 所有 `riskAllergens` id 存在于 `allergens.json`。
- `sourceImage` 指向的本地文件存在。
- 没有重复的 `date + mealPeriod`。
- `index.json` 的 `weeks[]` 与 `weeks/` 目录一一对应，`dates`/`meals`/`dishes` 与实际周文件内容一致，`range`/`total` 与汇总一致。
- `dish-catalog.json` 菜品名唯一，`occurrences` 与周食谱对应，每条 occurrence 的 `variantId` 必须存在于该菜的 `variants[]` 里，且 `primaryVariantId` 指向的变体与顶层 `ingredients`/`riskAllergens` 相同（主配方语义）。
- `dish-catalog.json` 中 `primaryBasis: "frequency"` 且 `variants.length > 1` 的菜必须带 `needsReview: true`；`latest` 口径下不标。人工复核清单里逐条给出处理结论。
- `ingredient-index.json` 的 `total` 与自身内容一致，`hits[].variantId` 存在于 catalog。
- `substitute-library.json` 通过 [`agent/schemas/substitute-library.schema.json`](schemas/substitute-library.schema.json)，`replaces` 使用存在的过敏原 id，候选不得漏掉双重过敏原。
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

- 有硬错误或低置信度未确认时，退出码非 0，不写入周文件。
- 人工确认后使用 `--reviewed` 才允许合并。
- `verified: true` 只能由人工确认步骤写入（落到 `dish-meta.json`），Agent 不得自动设置。
- `needsReview: true` 的菜（仅 `frequency` 口径会出现）必须逐条复核：统一配方、或拆成两道菜（加别名），或确认保留多变体。多配方本身不必复核，历史配方本来就该并存。
