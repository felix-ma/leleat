# Agent 侧资料

本目录不是前端运行时代码，不会被 Vite 打包，也不包含任何浏览器端识别逻辑。
根目录的 [AGENTS.md](../AGENTS.md) 只放硬约束与导航，细节规范都在这里，按任务读。

## 规范文档

| 文件 | 内容 | 原编号 |
| --- | --- | --- |
| [images.md](images.md) | 图片命名、脱敏裁剪、发布、线上核对、历史旧图补救 | §10 |
| [recognition.md](recognition.md) | 目标版式、识别流水线、DeepSeek 调用、中间结果结构 | §1–§4 |
| [allergen-substitute.md](allergen-substitute.md) | 过敏原确定性匹配、替餐优先级与规则 | §5–§6 |
| [data-merge.md](data-merge.md) | 投影为周分片（index.json + weeks/*）、菜品知识库变体规则、合并策略、校验与复核 | §7–§9 |
| [publish.md](publish.md) | Git 提交与推送、建议 CLI 契约与退出码 | §11–§12 |
| [acceptance.md](acceptance.md) | 验收样例与断言、缓存与安全边界 | §13–§14 |

## Schema 与 Prompt

- 周表中间结果 Schema：[schemas/week-menu.schema.json](schemas/week-menu.schema.json)
- 周清单入口 Schema：[schemas/week-index.schema.json](schemas/week-index.schema.json)
- 周食谱文件 Schema：[schemas/week-file.schema.json](schemas/week-file.schema.json)
- 菜品知识库 Schema：[schemas/dish-catalog.schema.json](schemas/dish-catalog.schema.json)
- 食材索引 Schema：[schemas/ingredient-index.schema.json](schemas/ingredient-index.schema.json)
- 人工字段 Schema：[schemas/dish-meta.schema.json](schemas/dish-meta.schema.json)、[schemas/ingredient-aliases.schema.json](schemas/ingredient-aliases.schema.json)
- 动态替餐库 Schema：[schemas/substitute-library.schema.json](schemas/substitute-library.schema.json)
- DeepSeek 多模态 Prompt：[prompts/extract-week-menu.md](prompts/extract-week-menu.md)
- 菜品库重建：`npm run catalog`（从 `weeks/*.json` 全量重建 `dish-catalog.json` 与 `ingredient-index.json`）
- 旧数据迁移：`npm run split`（一次性，把单体 `recipes.json` 拆成 `index.json` + `weeks/`，跑过一次后不再需要）

## 版本与边界

- **版本**：1.6
- **适用输入**：幼儿园「一周带量食谱及营养分析表」图片（周一至周五、早餐/早点/中餐/午点、每格含食谱/食物/重量）
- **适用仓库**：`leleat`
- **运行位置**：仓库外的本地 Agent / 本地脚本

前端仍然只读 `public/assets/data/*.json`，不做 OCR、不调用视觉模型、不写仓库：启动只拉 `index.json`，选中周后再按 `file` 按需加载 `weeks/YYYY-Www.json`。管理端直接调用 DeepSeek 多模态模型识别图片，Agent 只在仓库外运行，最终把 `index.json`、`weeks/*.json`、`dish-catalog.json`、`ingredient-index.json`、`substitute-library.json` 和图片提交进仓库。

本规范只交付文档、Schema 和 Prompt，不提供可执行的视觉模型调用代码；Agent 按 [publish.md](publish.md) 的 CLI 契约实现。

## 15. 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| 1.0 | 2026-11-05 | 初版：适配一周带量食谱表格、早点餐次、克重、红字替餐、合并与 Git 流程 |
| 1.1 | 2026-11-05 | 增加菜品知识库增量合并、JSON 存储决策、settings.json 补剂配置、7 天补剂表验收 |
| 1.2 | 2026-11-05 | 改为 DeepSeek 多模态识别、知识库对比、动态替餐库、实时 DOCX 生成说明 |
| 1.3 | 2026-11-06 | 合并原 AGENT_SPEC.md 与项目级技能为单一的 AGENTS.md；图片裁剪发布并入 §10 |
| 1.4 | 2026-11-06 | 渐进式披露：AGENTS.md 只留硬约束与导航，正文按 §1–§15 拆进 `agent/*.md`，编号不变 |
| 1.5 | 2026-11-06 | 改完即发布：取消「默认只写工作区」，任务结束必须 commit + push，涉图/数据再 deploy |
| 1.6 | 2026-11-13 | 存储改为周分片：`recipes.json` → `index.json` + `weeks/YYYY-Www.json`；菜品库改为变体口径（`variantId`/`variants[]`/`needsReview`），食材取并集改为多配方并存；新增 `ingredient-index.json`、`ingredient-aliases.json`、`dish-meta.json` 三份人工/派生数据与对应 Schema |
| 1.7 | 2026-11-13 | 主配方口径改为「最近一次出现为准」：`dish-catalog.json` 顶层 `ingredients`/`riskAllergens` 由 `primaryVariantId` 指向，选择策略放进 `dish-meta.json` 的 `reviewPolicy.mode`（`latest` 默认 / `frequency` 旧口径），单条可用 `primaryVariant` 钉住；`needsReview` 收窄为「口径未定」，历史配方仍全量保留在 `variants[]`；溯源弹窗补「库内主配方」说明 |
