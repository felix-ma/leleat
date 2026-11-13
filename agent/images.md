# 图片：裁剪、发布与核对（§10）

> 本文件是 [AGENTS.md](../AGENTS.md) 的明细（§10），只在做对应任务时读。

## 10. 图片资产：裁剪、发布与核对

目标只有一句：**图片里只留菜单信息，不留任何能指向具体幼儿园的文字。**
识别信息固定印在表格上方一条带里（`单位：××幼儿园`、大标题、右上角日期范围与印刷周次），它和真正的表格之间有一条横贯全图的黑色细线。所以裁剪是**纯像素计算，不用多模态模型、不用 OCR**：找到第一条长横线，从那条线开始往下切。

### 10.1 命名与压缩

```text
public/assets/images/
├── 20261012-week-menu.jpg   # 整周裁图（顶部条带已裁），归档用
├── 20261012-menu.jpg        # 周一的日列裁剪，供前端 sourceImage
├── 20261013-menu.jpg
└── ...
```

- 整周裁图 `YYYYMMDD-week-menu.jpg`（YYYYMMDD = 周一），单日裁图 `YYYYMMDD-menu.jpg`。两者都是**已裁掉顶部条带**的版本，真正的原图只留在 `/tmp`。文件名必须稳定——`weeks/YYYY-Www.json` 里的 `sourceImage` 只引用单日裁图，发布后不再改名。
- 日列裁剪比整周图更适合前端缩略图和大图查看。
- `sourceImage` 挂在每天的午餐条目上，避免同一张图在每个餐次重复显示；只保存整周图时，只在周一午餐挂一次。
- 图片压缩：最长边不超过 1600px，JPEG 质量 78–85；单张尽量小于 1.5MB。
- 图片不存在时前端会静默隐藏，但 Agent 校验应报错。

### 10.2 脱敏裁剪（纯像素）

```python
# crop_menu.py —— 一张图一个参数对
from PIL import Image
import numpy as np, sys

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src)
w, h = im.size
rows = (np.asarray(im.convert('L')) < 128).mean(axis=1)   # 每行暗像素占比
top = next((y for y in range(h) if rows[y] > 0.55), None)  # 第一条横贯全图的线
if top is None:
    raise SystemExit(f'{src}: 没找到表格横线，停下来人工看，不要硬裁')
im.crop((0, top, w, h)).save(dst, 'JPEG', quality=86, optimize=True, progressive=True)
print(f'{src}: {w}x{h} -> {w}x{h-top} (crop_top={top})')
```

阈值 `0.55` 是本机实测值，正常命中情况：

| 图类型 | 尺寸 | 命中的线 | 裁掉 |
| --- | --- | --- | --- |
| 整周原图 | ~1045×620 | y=41–43 | 顶部 41–43 px（园名+标题+周次） |
| 单日列裁图 | ~283×580 | y=3–5 | 顶部 3–5 px 残留标题碎片 |

安全边界：

- **必须保留** `餐名(用餐时间) | 星期一 2026.11.2 | 食谱 食物 重量` 这一行——日期和表头都在这，是菜单信息。
- 横线检测失败（`top is None`，或 `top > 80`）就停下问用户，不要凭感觉裁。
- 不要把左侧「早餐/早点/中餐/午点」栏切掉，也不裁右侧。
- 裁完用 `read_image` 目视 1–2 张，确认顶部只剩表格线，没有半截字。

### 10.3 处理流程

1. **落盘备份**：原图复制到 `/tmp/leleat-orig/`（永不进仓库），裁好的放 `/tmp/leleat-cropped/`。
2. **命名**：按 §10.1。
3. **裁剪**：逐张跑 §10.2 的规则，打印每张的 `crop_top` 和尺寸变化。
4. **自检**：
   ```python
   # 顶 6 行应是那条表格线（暗占比 ≈0.34）；明显更高说明还有文字
   a = np.asarray(Image.open(p).convert('L'))
   assert (a[:6] < 128).mean() < 0.45
   ```
   再目视确认整张图里没有「单位」「幼儿园」字样区域——靠眼睛，别靠猜。
5. **提交并推送**：`git add public/assets/images && git commit -m "data(menu): add 20261109 menu images" && git push origin main`。不提交直接 deploy，下次 build 会把这些图从 `dist` 里丢掉。
6. **发布**：`npm run deploy`（= `npm run build` + `gh-pages -d dist --dotfiles`，别手写 gh-pages 参数）。
7. **核对线上**：逐张比对哈希，不要只看页面能打开。
   ```python
   import hashlib, urllib.request, glob, os
   for p in sorted(glob.glob('dist/assets/images/*.jpg')):
       n = os.path.basename(p)
       live = urllib.request.urlopen(f'https://felix-ma.github.io/leleat/assets/images/{n}').read()
       assert hashlib.sha256(live).digest() == hashlib.sha256(open(p,'rb').read()).digest(), n
   ```
   CDN 一般几秒内刷新；全部图片比对通过才算完成。

### 10.4 裁图阶段的隐私判断

- 图里不许出现：幼儿园全名、单位名、儿童姓名、班级、老师姓名、电话。裁不掉就停下问，不做「差不多看不清」的判断。
- 原图只放 `/tmp`；`public/assets/images/` 只放裁好的版本，不为了「留档」把原图提交进仓库。
- 仓库是 public、Pages 在线，任何提交上去的字节都可被公开下载，历史提交也一样（见 §10.5）。

### 10.5 历史旧图补救

旧字节不会因为覆盖文件而消失，需要重写并强推：

```bash
# 1) 工作区换成裁剪版并折进 HEAD（图片只在最后一个提交里时）
git add public/assets/images && git commit --amend --no-edit
# 2) 需要改文字时，重写全部提交
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --tree-filter \
  'for f in AGENT_SPEC.md AGENTS.md README.md agent/*.md; do
     [ -f "$f" ] && sed -i "s/真实园名/XX幼儿园/g" "$f"
   done' refs/heads/main
# 3) 强推主分支
git push --force origin main
# 4) gh-pages 单独重建为单提交（它默认追加提交，不会自动清历史）
rm -rf /tmp/ghpub && mkdir /tmp/ghpub && cd /tmp/ghpub && git init -q -b gh-pages \
  && cp -a /root/workspace/leleat/dist/. . && git add -A \
  && git -c user.name=felix-ma -c user.email=felix-ma@users.noreply.github.com commit -qm Deploy \
  && git remote add origin git@github.com:felix-ma/leleat.git && git push --force origin gh-pages
# 5) 清本地旧对象
git reflog expire --expire=now --all && git gc --prune=now -q
```

强推后旧提交仍可按 SHA 从 `raw.githubusercontent.com` 下载一段时间（GitHub 不立即 GC）。彻底清除只有删库重建、转 private 或找 GitHub Support；上次用户选了「先这样」，再遇到先问，别自作主张。

### 10.6 边界

- **不做数据识别**：菜名、食材、过敏原、替餐的抽取属于第 3–9 节的 Agent 流程。新一周的图换上去后页面不会显示——要一起入库时先跟用户确认。
- 不改 `vite.config.ts` 的 `base`、不改已发布的图片文件名、不动 `public/assets/data/*.json` 的引用路径。
