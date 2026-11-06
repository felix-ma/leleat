# 提交推送与 CLI 契约（§11–§12）

> 本文件是 [AGENTS.md](../AGENTS.md) 的明细（§11–§12），只在做对应任务时读。

## 11. Git 提交与推送

### 11.1 默认就是发布

文件改动完成后**必须**提交并推送，不存在「只写工作区待确认」这种交付方式：

```bash
npm run build                 # 校验先过
git add <明确列出的文件>
git commit -m "…"
git push origin main
npm run deploy                # 图片/数据改动后重建 gh-pages
```

结束前自检：`git status --short` 干净、`git log origin/main..HEAD` 为空。

**部署本身不是可选项**：任何代码/数据改动，`git push` 之后一律要跑 `npm run deploy`（`gh-pages` 分支）。用户说的「不用检查部署」只指**不打开线上页面/不抓 CDN 轮询**，不是说不部署。漏跑 deploy 等于线上还是旧版，属于交付失败。

自检可以只做本地一次性的零成本核对（允许，不算在线复核）：

```bash
git fetch origin gh-pages
git show origin/gh-pages:index.html | grep -o 'index-[A-Za-z0-9_-]*\.js'   # 与本地 dist/index.html 里的 hash 应一致
```

**页脚版本号会滞后是正常的**：`gh-pages` 推送成功后，GitHub Pages 还要排队重新构建，且它对 `index.html` 设了 `Cache-Control: max-age=600`，所以页脚「构建 xxxx」可能比最新提交落后 5–15 分钟。这不是没部署，不要为了催它反复 deploy（重复推送不会加速，反而多占构建配额）。用户报「还是旧版本号」时，先用本地核对法确认 `origin/gh-pages` 的 `index.html` 引用与本地 `dist` 一致，若一致就说明是 Pages 侧在排队。

**不要在线复核**：提交 + deploy 之后不要打开线上页面/抓 CDN 校验（Pages 缓存刷新慢，轮询很耗时间和 token）。交付时只在回复里给**最新提交 ID** 和本次改动总结，线上状态由用户自己看。

- 不能提交的东西（API Key、原始未脱敏图、`.agent-out/`、缓存）不要写进工作区，避免手滑提交。
- 只提交本次任务相关的文件，不顺手 `git add -A` 带上无关改动。

### 11.2 前置检查

- 当前分支为 `main`。
- 工作区没有与本次任务无关的未提交改动；有则先问用户。
- 校验和构建通过。
- 只 stage：
  - `public/assets/data/recipes.json`
  - `public/assets/data/dish-catalog.json`
  - `public/assets/data/substitute-library.json`（替餐库变化时）
  - `public/assets/data/settings.json`（仅补剂或学校信息变化时）
  - `public/assets/images/*`
  - 文档改动（`AGENTS.md`、`agent/*.md`、`README.md`）
- 不提交 `.agent-out/`、缓存、API Key、原始未脱敏日志与图片。

### 11.3 提交信息

```text
data(menu): add 2026-W43 weekly menu
data(menu): update 2026-W43 after review
docs(agent): split AGENTS.md into agent/*.md
```

### 11.4 推送流程

1. `git pull --rebase`
2. 重新运行校验
3. `git push origin main`
4. 冲突或 rebase 失败立即停下问用户；除历史旧图补救（§10.5）外不用 force push。

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

# 4. 人工复核后正式写入并提交推送
python agent/merge_recipes.py \
  --current public/assets/data/recipes.json \
  --patch .agent-out/2026-W43/recipes.patch.json \
  --reviewed

# 5. 增量合并菜品知识库（或直接运行 npm run catalog）
python agent/merge_catalog.py \
  --recipes public/assets/data/recipes.json \
  --catalog public/assets/data/dish-catalog.json

# 6. 提交并推送（默认动作，不是可选项）
python agent/publish.py
```

退出码建议：

- `0` 成功
- `1` 输入/配置错误
- `2` 需要人工复核
- `3` 校验失败
- `4` Git 冲突或推送失败
