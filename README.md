# AI 学习助手（Windows 桌面版）

面向浙江初中生的 AI 个性化学习应用：接入你自己的大模型 API，基于内置教材、上传材料和你的成绩情况，生成短练习与详细报告，管理学习进度、请假补课与每日安排。

前端、后端、运行环境全部打包进安装包，安装后即可离线启动（AI 功能需要联网调用你自己的 API）。

> 📦 **直接下载安装包**：<https://github.com/AnJianhe/ai-study-assistant/releases/latest>
> 仓库：<https://github.com/AnJianhe/ai-study-assistant>

## 一、安装与启动

1. 双击 `dist/AI学习助手-1.0.2-安装包.exe`（或从 [Releases](https://github.com/AnJianhe/ai-study-assistant/releases/latest) 下载最新版）。
2. 选择安装目录（默认 `%LOCALAPPDATA%\Programs\AI学习助手`），安装程序会创建桌面快捷方式和开始菜单项。
3. 首次启动进入引导页：填写 API → 个人信息 → 成绩与教材确认 → 开始学习。

卸载：Windows 设置 → 应用 → AI学习助手 → 卸载（不会删除你的学习数据，数据在 `%APPDATA%\AIStudyAssistant\data`，可在设置页一键打开）。

### ⚠️ 关于 360 / 安全软件拦截

安装包**没有代码签名证书**（个人开发者常见情况），安装时 360 可能弹出「有程序试图修改关键程序 DLL 文件」（被修改的是 Electron 自带的 `d3dcompiler_47.dll`），这是 NSIS 安装器解压运行库时的**误报**。

处理方式（任选其一）：
- 弹窗里选择「允许本次操作」（或先勾选「不再提醒」再允许）；
- 临时退出 360 安全卫士再安装，装完再打开；
- 把安装包加入 360 信任列表后再安装。

如果被拦截后安装目录缺少 `d3dcompiler_47.dll`，应用会启动闪退——重新安装并允许即可，这是文件没写全导致的，不是程序错误。

## 二、界面风格

默认 **暗黑模式（Dark Mode）**：`#0f172a` 深色背景、半透明深色卡片、slate 文字层级、蓝色 `#3b82f6` 与绿色 `#22c55e` 强调色；卡片 hover 边框提亮上浮、按钮内嵌高光 + 按下缩放、键盘焦点蓝色描边。设置页或侧边栏底部「主题」按钮可切换浅色主题。

## 三、API 配置

支持任意 **OpenAI 兼容** 的 `/chat/completions` 接口：

| 配置项 | 示例 |
| --- | --- |
| 接口地址 | `https://api.deepseek.com` 或 `https://api.openai.com/v1` |
| API Key | 你的密钥（只存在本机，渲染层拿不到） |
| 模型名 | `deepseek-chat` / `gpt-4o-mini` / `qwen-plus` … |
| 深度思考模型（可选） | 例如 `deepseek-reasoner`，留空则用主模型 |

- 流式输出：默认开启。
- 深度思考：默认关闭，由你在设置或对话页手动打开（开启后解析 `reasoning_content` 并展示「思考过程」折叠区）。
- 联网搜索：**始终开启**（需求规定不可关闭）。优先使用你配置的 Tavily / Serper / 博查 Key；没配置时自动用 Bing 网页检索兜底。检索失败会如实提示，不会假装搜过。
- 文件上传：始终可用，不依赖 API 是否可用。

## 四、功能地图

| 页面 | 能力 |
| --- | --- |
| 学习台 | 今日安排、快捷开始练习、最近报告、每日询问卡片 |
| 练习 | 选科目 → 选时长/意愿（选项或自定义输入）→ AI 出 3–6 道题 → 作答 → 个性化报告 |
| 报告 | 历史报告、正确率、逐题批改、薄弱知识点、可执行建议、引用来源 |
| 进度 | 各科自定义进度、请假登记、补课计划（AI 生成安排）、自定义学习安排 |
| 资料库 | 14 份内置教材（可读正文）、上传课件/作业/试卷/自己的课本、删除与预览 |
| AI 助手 | 多轮对话、流式、深度思考、图片与材料附件、引用来源 |
| 设置 | API、个人信息、各科成绩（每科有明确的「跳过」按钮）、教材版本、每日询问、数据目录 |

### 关于成绩「跳过」

每科成绩都有独立的「语文跳过」「数学跳过」……按钮：点了表示 **暂无成绩（没考/缺考）**，程序内部存 `skipped: true`、分数为 `null`，AI 提示词里明确写「跳过 ≠ 0 分」。0 分是合法真实分数，可以正常填写。

### 教材版本（固定）

| 科目 | 版本 | 说明 |
| --- | --- | --- |
| 语文 | 人教版 | 统编教材 |
| 数学 | 浙教版 | 浙江初中数学 |
| 英语 | 人教版 | 人教社 Go for it! 体系 |
| 科学 | 教科版 | 浙江初中科学：物理、化学、生物等合并为一门 |
| 道法 / 历史 / 地理 | 人教版 | 社会分为三科，均为人教版 |

内置 14 份教材梳理（七、八年级 × 7 科）位于 `assets/textbooks/`，可在资料库直接阅读；如果内置内容与你的课本不一致，上传「自己的课本」照片/文字即可纠正，AI 会优先采用你上传的材料。

## 五、降低 AI 幻觉的做法

1. 每次请求先做本地检索（内置教材 + 你的材料，BM25 近似）再拼进 system prompt，要求「优先依据资料、不确定就说不确定、不得编造页码/真题」。
2. 联网搜索始终执行，结果作为补充资料并标注来源；失败时提示「本轮联网检索失败」。
3. 出题/报告走严格 JSON 协议，主进程解析校验；解析失败自动回退到内置题库与本地统计判分，绝不把坏数据当结果。
4. 练习报告的对错由主进程本地判分（选择题按选项、填空按要点），AI 只负责讲解与建议，避免「AI 说了算」。
5. 成绩「跳过」语义在提示词层面强制约束。

## 六、目录结构

```
AI-Study-Assistant/
├── main.js                 # 主进程：窗口、IPC、本地数据
├── preload.js              # 安全桥（contextBridge）
├── index.html / styles.css / renderer.js   # 前端 SPA
├── lib/
│   ├── ai.js               # AI 网关：SSE 流式、JSON 解析、兜底、判分
│   ├── prompts.js          # 系统提示词与各模式指令（防幻觉规则）
│   ├── retrieval.js        # 本地检索（BM25 近似）
│   ├── search.js           # 联网搜索（Tavily/Serper/博查/Bing 兜底）
│   ├── materials.js        # 上传材料管理
│   ├── textbooks.js        # 内置教材
│   ├── quizbank.js         # 内置题库
│   ├── settings.js         # 设置/档案/成绩归一化
│   └── store.js            # JSON 原子存储
├── assets/
│   ├── textbooks/          # 14 份内置教材（index.json + markdown）
│   └── quizbank/           # 内置题库（70 题）
├── scripts/                # 图标生成、自测、打包脚本（不打包进应用）
├── build/icon.ico          # 应用图标
└── dist/                   # 打包输出（安装包）
```

运行数据：`%APPDATA%\AI学习助手\data`
- `settings.json` / `profile.json` / `scores.json`
- `materials/`（index.json + uploads/）
- `store.json`（进度、计划、请假、报告列表等）

## 七、开发与打包

```powershell
# 开发运行
npm install
npm start

# 主进程自测（无需 Electron / 无需 API Key）
node scripts/selftest.js

# 打包 NSIS 安装包（国内镜像）
powershell -ExecutionPolicy Bypass -File scripts/build-installer.ps1
```

打包产物：`dist/AI学习助手-1.0.0-安装包.exe`（约 90–120MB，含 Electron 运行时）。

## 八、已知限制

- 上传 PDF/老版 Office 不做解析：PDF 请截图成图片上传；`.ppt/.doc/.xls` 请另存为 `.pptx/.docx/.xlsx`（新版 Office 会上传时自动转成 Markdown 文本）。
- 图片会随请求发送给多模态模型，普通文本模型可能忽略图片；建议使用支持视觉的模型。
- 联网搜索兜底使用 Bing 网页检索，结果质量受网络环境影响；配置 Tavily/Serper/博查可获得更稳定的结果。
- 报告中的「自动判分」对填空/简答采用要点匹配，可能与老师人工批改略有差异，以老师批改为准。
