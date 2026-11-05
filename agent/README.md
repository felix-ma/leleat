# Agent 侧资料

本目录不是前端运行时代码，不会被 Vite 打包，也不包含任何浏览器端识别逻辑。

- 完整识别规范：[../AGENT_SPEC.md](../AGENT_SPEC.md)
- 周表中间结果 Schema：[schemas/week-menu.schema.json](schemas/week-menu.schema.json)
- 菜品知识库 Schema：[schemas/dish-catalog.schema.json](schemas/dish-catalog.schema.json)
- 动态替餐库 Schema：[schemas/substitute-library.schema.json](schemas/substitute-library.schema.json)
- DeepSeek 多模态 Prompt：[prompts/extract-week-menu.md](prompts/extract-week-menu.md)
- 菜品库生成样例：`npm run catalog`（从 recipes.json 生成/合并 `dish-catalog.json`）

管理端直接调用 DeepSeek 多模态模型识别图片，不使用 OCR。Agent 只在仓库外运行，最终把 `recipes.json`、`dish-catalog.json`、`substitute-library.json` 和图片提交进仓库；前端继续保持只读。
