# Leleat（乐乐食谱）Agent 上下文

幼儿园周食谱 + 过敏替餐的纯静态站点：Vue 3 + Vite + Tailwind，GitHub Pages 托管。
前端只读 `public/assets/data/*.json`，不做 OCR、不调视觉模型、不写仓库。

本文件只放**每次动手都必须遵守**的东西。详细规范按任务拆在 `agent/` 下，用到哪份读哪份，不要一次性全读。

## 硬约束

- 仓库是 **public**、Pages 在线：任何提交的字节都可被公开下载，历史提交也是。按这个前提判断能不能写。
- 图片与文案里不出现幼儿园全名、班级、老师或儿童姓名、电话；文档统一用 `XX幼儿园` 占位。
- 原图只放 `/tmp`，`public/assets/images/` 只放裁好的版本；`YYYYMMDD-*.jpg` 一旦发布不改名（`weeks/YYYY-Www.json` 里对应日期的 `sourceImage` 引用它）。
- 只改数据与图片：不动前端布局、不动 `vite.config.ts` 的 `base`、不动 JSON 引用路径。
- **改完就发布**：每个任务的改动完成后必须 `git commit` 并 `git push origin main`；涉图/涉数据再跑 `npm run deploy`。不留在工作区等确认。
- Python 管理端工具统一装在项目级 `.venv/`，用 `./.venv/bin/python` 调用，不装全局 `python3`；依赖清单是 `requirements.txt`，重建方式见 [README.md](README.md)「Python 管理端工具：项目级 venv」。
- 系统级软件（LibreOffice / 中文字体 / poppler）由 `apt-get` 装到系统、不进仓库也不进 `.venv/`；清单与重建命令见 [README.md](README.md)「系统级依赖（apt / 系统软件）」，环境重装后按需重装。
- 不能提交的东西（API Key、原始未脱敏图、`.agent-out/`、`.venv/`、缓存）不要写进工作区。

## 常用命令

```bash
npm run build     # vue-tsc + vite build
npm run deploy    # build + gh-pages -d dist --dotfiles（推送 gh-pages）
npm run catalog   # 从 weeks/*.json 重建 dish-catalog.json 与 ingredient-index.json
npm run split     # 一次性迁移：旧的单体 recipes.json → index.json + weeks/（已跑过，勿重跑到新数据上）
```

## 文档地图

先读本文件的硬约束，再按任务读**一份**明细（跨文件引用一律用 `§N` 编号，拆分后编号不变）：

| 任务 | 读哪份 | 原编号 |
| --- | --- | --- |
| 换新一周食谱图、裁图、发布、核对线上 | [`agent/images.md`](agent/images.md) | §10 |
| 菜名/食材识别、中间结果结构 | [`agent/recognition.md`](agent/recognition.md) | §1–§4 |
| 过敏原标记、替餐匹配 | [`agent/allergen-substitute.md`](agent/allergen-substitute.md) | §5–§6 |
| 写 `weeks/*.json` + `index.json`、合并、校验复核 | [`agent/data-merge.md`](agent/data-merge.md) | §7–§9 |
| 提交、推送、CLI 契约 | [`agent/publish.md`](agent/publish.md) | §11–§12 |
| 验收断言、缓存与隐私边界 | [`agent/acceptance.md`](agent/acceptance.md) | §13–§14 |
| 项目版本、变更记录、Schema 入口 | [`agent/README.md`](agent/README.md) | §15 |

**一次换图的标准路径**：`agent/images.md` → 需要入库时再读 `agent/recognition.md` → `agent/data-merge.md` → `agent/publish.md`。

**边界**：不做识别时不要读识别类文档；`agent/` 里没有的内容就是没有定过，先问，别自己定规则。
