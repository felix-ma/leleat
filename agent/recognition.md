# 识别：版式、流水线、中间结果（§1–§4）

> 本文件是 [AGENTS.md](../AGENTS.md) 的明细（§1–§4），只在做对应任务时读。

## 1. 目标与非目标

### 目标

1. 从一张周表图片中提取 5 个工作日、每天 4 个餐次、每个餐次的菜品和食材克重。
2. 生成可校验的中间结果，保留原始文字、置信度和低置信警告。
3. 根据 `allergens.json` 做确定性过敏原标记；通过动态替餐库和已确认的菜品专属替餐生成建议。
4. 安全地合并进 `public/assets/data/recipes.json`，并增量维护 `dish-catalog.json`，保护人工确认过的字段。
5. 产出可追溯的 Git 提交并推送到 `origin main`（见 §11）。

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
  → git commit + push
```

### 3.1 预处理（可选）

- 管理端不安装 OCR 引擎，不使用 Tesseract。
- 可做自动旋转/纠偏、裁边、适度放大和对比度增强，帮助多模态模型看清小字。
- 表格列宽/行边界由模型结合图片直接理解；预处理只是辅助，不替代结构化校验。
- 保存整周原图；如需人工复核，再裁出日期列图片。

### 3.2 DeepSeek 多模态识别

1. 将整周图片发送给 DeepSeek 多模态模型，要求按 `week-menu.schema.json` 输出 JSON。
2. 整页先识别元信息：单位、日期范围、印刷周次、重量单位。
3. 对 5×4 个单元格逐格识别，避免一次调用跨行漏菜。
4. 如果整页结果列数、餐次数或日期不一致，退回逐格重识别，不靠猜。
5. 日期、ISO 周、过敏原和替餐由确定性代码后处理，模型不负责这些规则。

### 3.3 DeepSeek 调用要求

- 使用 DeepSeek 的 OpenAI-compatible chat completions 接口，模型名从 `DEEPSEEK_VISION_MODEL` 环境变量读取。
- API Key 从 `DEEPSEEK_API_KEY` 读取；不写仓库、不写日志。
- 图片以 base64 data URL 或服务支持的图片 URL 传入。
- 优先要求 JSON output；服务不支持 strict schema 时，在本地用 `jsonschema` 校验并对失败结果重试一次。
- 不使用 OCR 文本作为主输入，不再维护 Tesseract / PaddleOCR 依赖。
- 同一图片 sha256 + prompt 版本 + 模型名做缓存，避免重复计费。
- 视觉模型只输出图片中可见内容；无法辨认的字段进入 `warnings`，不得自动补全。

```python
# 伪代码：具体 SDK 可替换，保持 OpenAI-compatible 调用形态
payload = {
    "model": os.environ["DEEPSEEK_VISION_MODEL"],
    "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": [
            {"type": "text", "text": USER_PROMPT},
            {"type": "image_url", "image_url": {
                "url": f"data:image/jpeg;base64,{image_b64}"
            }},
        ]},
    ],
    "response_format": {"type": "json_object"},
}
```

Prompt：[`agent/prompts/extract-week-menu.md`](prompts/extract-week-menu.md)  
中间结果 Schema：[`agent/schemas/week-menu.schema.json`](schemas/week-menu.schema.json)

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
    "visionModel": "<DEEPSEEK_VISION_MODEL>",
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
