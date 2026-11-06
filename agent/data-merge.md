# 数据投影、合并与校验（§7–§9）

> 本文件是 [AGENTS.md](../AGENTS.md) 的明细（§7–§9），只在做对应任务时读。

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
      "sourceImages": ["assets/images/20261102-menu.jpg"]
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

前端用知识库显示“已收录、第 N 次出现、首次/最近日期”。Schema：[`agent/schemas/dish-catalog.schema.json`](schemas/dish-catalog.schema.json)。样例生成脚本：`npm run catalog`。

#### 7.5.1 识别结果与知识库对比

DeepSeek 提取出菜品后，先查 `dish-catalog.json`，再决定如何入库：

| 情况 | 处理 |
| --- | --- |
| 菜名/别名不存在 | `NEW`：新菜，记录食材、发生日期、图片 |
| 菜名存在，食材一致 | `REUSED`：直接复用标准食材，只追加 occurrence |
| 菜名存在，食材有新增/缺失 | `CHANGED`：保留标准记录，写入差异报告；新食材追加到食材集合 |
| 菜名存在，但食材冲突明显 | `CONFLICT`：不覆盖，阻断自动合并，交人工确认 |
| 已 `verified` | 只允许追加 occurrence，不改食材/过敏原/替餐 |

食材比较前做归一化：去首尾空格、统一全半角、合并连续空白；有明确别名时使用别名表（如 `番茄/西红柿`）只做匹配，不改原图文字。

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
- `dish-catalog.json` 通过 [`agent/schemas/dish-catalog.schema.json`](schemas/dish-catalog.schema.json)，菜品名唯一，occurrence 与食谱对应。
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

- 有硬错误或低置信度未确认时，退出码非 0，不写入 `recipes.json`。
- 人工确认后使用 `--reviewed` 才允许合并。
- `verified: true` 只能由人工确认步骤写入，Agent 不得自动设置。
