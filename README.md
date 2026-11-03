# 手写试字 · 喵咛狗爬黑

把 [boltomli/MyShinyApps/handwriting](https://github.com/boltomli/MyShinyApps/tree/master/handwriting)
（R Shiny + Python handright + 沐目体）和
[miorning-goupahei](https://miorning.github.io/miorning-goupahei/)
（纯静态试字站 + 可商用的狗爬黑字体）合成了一个**纯前端、零依赖**的轻量页面：

输入文字 → 按 Handright 的模板参数做随机扰动排版 → canvas 预览 → 导出 PNG / WebP。

## 运行

**直接双击 `index.html` 就能用**（`file://` 下自动改用 `FontFace url()` 载入本地字体，不走会被 CORS 拦的 `fetch`，只是没有下载进度条）。

想看真实字节进度，或改动后热更新，可以起个本地服务器：

```bash
python3 -m http.server 8077
# 打开 http://localhost:8077/
```

## 部署到 GitHub Pages

`.github/workflows/deploy-pages.yml` 在**构建时**才下载字体并打包，所以主分支依旧只有 ~196KB，站点却是完全自托管的（不依赖 miorning.github.io）：

1. 仓库 **Settings → Pages → Source** 选 **GitHub Actions**（只需点一次）
2. 之后 push 到 `main` 自动构建部署 → `https://boltomli.github.io/handwriting/`

流水线会先 `sha256sum -c` 校验三个 woff2 再发布。站点只打包运行时必需的文件：

```
_site/
├── index.html      # MIT
├── coverage.js     # OFL-1.1
├── OFL.txt         # 字体许可（分发字体必须随附）
├── NOTICE          # 许可范围与署名
└── webfonts/       # 构建时下载，不进 git
```

注意 `README.md` / `demo.png` 是 CC BY-NC-SA（非商业），**故意不上站**——部署出去的整站只有 MIT 代码 + OFL 字体，商用无虞。

## 文件

| 文件 | 说明 |
| --- | --- |
| `index.html` | 全部界面与逻辑，单文件，无框架、无 CDN |
| `coverage.js` | 字表位图（main/extra 各 35KB），由字体文件生成，**勿手改** |
| `webfonts/*.woff2` | **不入库**（36MB），需自己下载一次，见下节 |
| `OFL.txt` | 字体的 SIL OFL 1.1 许可证（分发字体必须一并带上） |
| `tools/build_coverage.py` | 从 woff2 重新生成 `coverage.js` |
| `e2e-test.mjs` | 零依赖 CDP 冒烟测试（17 项断言） |

## 下载字体（仓库不含 woff2）

`webfonts/` 已加入 `.gitignore`，字体从官方站点拉一次即可：

```bash
mkdir -p webfonts && cd webfonts
base=https://miorning.github.io/miorning-goupahei/webfonts
curl -sLO $base/MiorningGoupaHei-Preview.woff2      # 84 KB
curl -sLO $base/MiorningGoupaHei-Regular.woff2      # 17.8 MB
curl -sLO $base/MiorningGoupaHeiExtra-Regular.woff2 # 17.9 MB
cd ..
sha256sum webfonts/*.woff2   # 应与官方 SHA256SUMS.txt 一致
```

Windows（PowerShell）：

```powershell
mkdir webfonts; cd webfonts
$base = 'https://miorning.github.io/miorning-goupahei/webfonts'
curl.exe -sLO "$base/MiorningGoupaHei-Preview.woff2"
curl.exe -sLO "$base/MiorningGoupaHei-Regular.woff2"
curl.exe -sLO "$base/MiorningGoupaHeiExtra-Regular.woff2"
certutil -hashfile MiorningGoupaHei-Regular.woff2 SHA256
cd ..
```

官方 SHA256（任一不符就重新下载）：

| 文件 | SHA256 |
| --- | --- |
| `MiorningGoupaHei-Preview.woff2` | `2479d2ee3ad6467a37f185fb1ee3240caeb59adaf0d30e1b9bcec85a71bcb994` |
| `MiorningGoupaHei-Regular.woff2` | `956a4f3c72aac242c3576edf0126073879002d277f3dea5ef53d91c9fe1189da` |
| `MiorningGoupaHeiExtra-Regular.woff2` | `d10a4cb6726acf56094351d389da68a853eddde4837881760b05682625d01e1d` |

**不下载也能用**：页面会自动回退到在线字体（GitHub Pages，首次 17.8MB）或系统已安装的字体。
另外两种方式：

- 装官方 `fonts/MiorningGoupaHei-Complete.ttc`（65MB，装完系统就有，本机探测直接命中，0 流量）
- 只有 `tools/build_coverage.py` 重新生成 `coverage.js` 时**必须**有本地 woff2

## 字体加载优先级

1. **本机已安装**：探测系统里的「Miorning Goupa Hei / 喵咛狗爬黑」，0 流量
2. **本地 `webfonts/`**：同源 http 下用 `fetch` 载入（带真实字节进度）；`file://` 下改用 `FontFace url()`
3. **在线兜底**：[GitHub Pages 官方 woff2](https://miorning.github.io/miorning-goupahei/)（CORS `*`），点击后才下载 17.8MB
4. **手动选择字体文件**：woff2 / woff / ttf / otf（不支持 ttc）

生僻补充库只在**用到补充库独有字符时**才提示加载，不预载。

## 与 Handright 模板参数的对应

`ttf2webp.py` 里的 `Template(...)` 被原样移植到 `layout()`：

| 原版参数 | 页面控件 | 默认值 |
| --- | --- | --- |
| `font_size` / `font_size_sigma` | 字号 / 抖动强度 | 96 / 12 |
| `line_spacing` / `line_spacing_sigma` | 行距 | 120 / 4 |
| `word_spacing` / `word_spacing_sigma` | 字距 | 12 / 3 |
| `perturb_x_sigma` / `perturb_y_sigma` | 抖动强度（0~300%） | 4 |
| `perturb_theta_sigma` | 抖动强度 | 0.05 |
| `left/top/right/bottom_margin` | 页边距 | 100 |
| 画布 900×1000 | 纸张（可选横版/方形/竖版） | 900×1000 |

随机数用 mulberry32 + Box-Muller，**同一个种子 + 同一段文字 = 同一张图**，
可以在「随机种子」里填回数字复现；导出尺寸 = 画布逻辑尺寸 × 清晰度（1×/2×/3×）。
内容超出一页时画布自动增高，不裁切。

## 缺字检测为什么查字表

最初用「渲染像素 vs notdef」做检测，**在浏览器里是错的**：字形缺失时 Chrome 会走
系统回退字体把字顶上，连主库没有的 `𰻝` 都会被判成「已收录」。所以改为用
`tools/build_coverage.py` 直接读 woff2 的 cmap，生成每位 1 bit 的位图（`coverage.js`）：

- 主库有 → 正常书写
- 只有补充库有 → 画虚线框 + 提示加载补充库
- 两库都没有（如 emoji）→ 画虚线框，**不用系统字体顶替**（与官方试字站行为一致）

## 测试

```bash
python3 -m http.server 8077 &   # 先起服务（也可 TEST_URL=file:///…/index.html 测双击场景）
node e2e-test.mjs               # 17 项：字体载入、墨迹、种子复现、缺字、补充库、换行增高、主题、导出
```

## 许可

| 内容 | 许可 | 说明 |
| --- | --- | --- |
| `index.html`、`e2e-test.mjs`、`tools/` | **MIT** | 可商用、可集成、可闭源二次开发，见 `LICENSE` |
| `README.md`、`demo.png` | **CC BY-NC-SA 4.0** | 署名 + 非商业 + 相同方式共享，见 `LICENSE-CC-BY-NC-SA-4.0.txt` |
| `coverage.js`、`OFL.txt`、`webfonts/*.woff2` | **SIL OFL-1.1** | 字体及其派生数据，**可商用**，不得附加限制 |

完整范围划分与第三方署名见 `NOTICE`：

- 字体「喵咛狗爬黑」© MIORNING（喵咛），SIL OFL 1.1，见 `OFL.txt`
- 排版算法参考 [Handright](https://github.com/Gsllchb/Handright)（BSD-3-Clause）
- 原 R Shiny 实现 © Song Li，MIT，见 [MyShinyApps/handwriting](https://github.com/boltomli/MyShinyApps/tree/master/handwriting)

> 「非商业」只约束 README 与 demo 图这类文档素材：**用本工具给商业项目出图没有障碍**——
> 代码是 MIT，字体和字表是 OFL，两者都可商用。
