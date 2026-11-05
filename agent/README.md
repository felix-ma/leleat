# Agent 侧资料

本目录不是前端运行时代码，不会被 Vite 打包，也不包含任何浏览器端识别逻辑。

- 完整识别规范：[../AGENT_SPEC.md](../AGENT_SPEC.md)
- 中间结果 JSON Schema：[schemas/week-menu.schema.json](schemas/week-menu.schema.json)
- 视觉模型 Prompt：[prompts/extract-week-menu.md](prompts/extract-week-menu.md)

规范针对“周一至周五 × 早餐/早点/中餐/午点、每格含食谱/食物/重量”的幼儿园周表。Agent 只在仓库外运行，最终把 `recipes.json` 和图片提交进仓库；前端继续保持只读。
