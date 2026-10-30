# AI 学习助手 · 前后端契约（CONTRACT v1）

> 本文件是主进程（后端）与渲染进程（前端）之间唯一的接口约定。
> 前端只实现 `index.html` / `styles.css` / `renderer.js`；主进程实现 `main.js` + `lib/*`。
> 任何一方不得擅自改动字段名、channel 名或事件结构；需要变更必须先改本文件。

## 0. 技术约束

- Electron 33，`contextIsolation: true`，`nodeIntegration: false`，`sandbox: false`（preload 需要 Node）。
- 前端为纯静态 SPA：`index.html` + `styles.css` + `renderer.js`，**不使用任何前端构建工具、不引入 npm 包、不加载任何外网 CDN 资源**（离线可用）。
- 图标全部用内联 SVG 或字符，字体使用系统字体栈。
- 所有 AI 内容都由主进程通过 IPC 流式推送，前端不得直接 fetch 外部 API（Key 不出主进程）。
- 允许 `script type="module"`；DOM 操作使用原生 API。

## 1. 数据模型（主进程负责读写，前端只读展示/提交）

### Settings（`settings.json`）
```js
{
  api: {
    baseUrl: "",        // 例如 https://api.deepseek.com  或 https://api.openai.com/v1
    apiKey: "",
    model: "",          // 主对话模型
    reasoningModel: "", // 可选：深度思考用模型，留空则同 model
    temperature: 0.3,
    maxTokens: 2048,
    timeoutSec: 120
  },
  ai: {
    stream: true,            // 流式输出，默认 true
    deepThinking: false,     // 深度思考，默认关（用户可开）
    webSearch: true,         // 联网搜索始终开启（UI 展示为强制开启，不可关闭）
    searchProvider: "auto"   // auto | tavily | serper | bocha | bing_html
  },
  search: {
    tavilyKey: "", serperKey: "", bochaKey: ""   // 可选，用户自己的搜索 API
  },
  learning: {
    dailyAsk: true,          // 每天是否询问"今天上了多少内容"
    askTime: "20:30",
    dailyMinutes: 40,        // 默认每日学习时长
    subjects: ["语文","数学","英语","科学","道法","历史","地理"]
  },
  ui: { theme: "light" }     // light | dark
}
```

### Profile（`profile.json`）
```js
{
  name: "", grade: "八年级",   // 七/八/九年级
  school: "", class: "",
  examName: "", examDate: "",
  notes: ""
}
```

### Scores（`scores.json`）
每科一条，`skipped: true` 表示明确"跳过"（没考/缺考/暂无），**不得用 0 表示跳过**。
```js
{
  examName: "", examDate: "",
  subjects: {
    "语文": { score: 96, full: 120, skipped: false },
    "数学": { skipped: true, score: null, full: 120 },
    ...
  }
}
```
前端录入：分数输入框 + 满分输入框 + 明确的「语文跳过」按钮；点跳过之后该项显示"已跳过（暂无成绩）"，再点可取消跳过。

### Material（上传材料，`materials/index.json` + `uploads/`）
```js
{
  id: "mat_xxx", name: "老师课件-光的折射.pptx 截图", kind: "handout"|"homework"|"paper"|"textbook"|"other",
  subject: "科学", createdAt: 1699999999999,
  text: "提取的文本内容（文本类）", // 可为空
  imagePath: "uploads/xxx.png",     // 图片类相对路径，可为空
  size: 12345
}
```
`kind` 中文含义：handout=课件/讲义，homework=当天作业，paper=试卷照片，textbook=自己的课本（用于纠正内置教材），other=其他。

### Report（`reports/*.json`）
```js
{
  id: "rep_xxx", createdAt: 1699999999999,
  mode: "quiz", subject: "数学",
  plan: { minutes: 20, willing: "想学", custom: "" },
  questions: [{ id, stem, type, options, answer, userAnswer, correct, knowledgePoint, explanation }],
  stats: { total: 5, correct: 3, accuracy: 0.6 },
  ai: { summary, strengths: [], weaknesses: [{knowledgePoint, evidence, advice}], nextSteps: [], encouragement },
  search: { ok: true, results: [{title,url}] },
  raw: "AI 原始文本（兜底用）"
}
```

## 2. preload 暴露的 `window.api`

> 所有方法返回 Promise；失败时 reject 一个 `Error`，`err.message` 为中文提示。

```js
window.api = {
  app: {
    info(): Promise<{version, userDataPath, packaged, today, platform}>,
    openDataFolder(): Promise<void>,
    openExternal(url): Promise<void>,
  },

  settings: {
    get(): Promise<Settings>,
    save(patchObject): Promise<Settings>,   // 深合并
  },

  profile: {
    get(): Promise<Profile>,
    save(profileObject): Promise<Profile>,
  },

  scores: {
    get(): Promise<Scores>,
    save(scoresObject): Promise<Scores>,
  },

  materials: {
    list(): Promise<Material[]>,                       // 按 createdAt 降序
    add(payload): Promise<Material>,                   // see below
    remove(id): Promise<void>,                          // 同时删文件
    readText(id): Promise<string>,                      // 文本类材料全文
  },

  textbooks: {
    list(): Promise<[{id, subject, grade, version, title, file, builtin:true, chars}]>,
    read(id): Promise<{meta, content}>,
  },

  bank: {
    list(subject?): Promise<Question[]>,   // 内置题库兜底
  },

  ai: {
    start(req): Promise<{requestId}>,       // 立即返回；随后通过 onEvent 推送
    abort(requestId): Promise<void>,
    onEvent(cb): () => void,                 // 返回取消订阅函数
  },

  store: {
    get(key): Promise<any>,
    set(key, value): Promise<void>,
    remove(key): Promise<void>,
    list(prefix?): Promise<[string]>,
  },

  dialog: {
    pickMaterial(): Promise<{name, kind, ext, dataUrl?, text?, size} | null>,
    pickImages(): Promise<[{name, dataUrl, size}] | null>,
  },
}
```

### `materials.add(payload)`
```js
{ name, kind, subject, dataUrl? /*图片 base64 dataURL*/, text? /*文本内容*/, ext? }
```
主进程负责：图片落盘（uploads/）、文本去重存储、提取可读的短摘要（不调 AI）。
支持格式：图片 png/jpg/jpeg/webp/gif/bmp；文本 txt/md/csv/json；**PDF 暂不支持全文解析**，前端在选择 PDF 后应提示"请截图上传"（仍可作为附件发送给多模态模型？——统一规则：PDF 不接受，提示截图）。

### `ai.start(req)`
```js
{
  mode: "chat" | "quiz" | "report" | "plan",
  messages: [{ role: "user"|"assistant", content: string, images?: string[] }], // images 为 dataURL
  context: {
    subject?: "语文",
    grade?: "八年级",
    materialIds?: ["mat_x"],
    useTextbooks?: true,
    examFocus?: true,
    // quiz 模式专用：
    quizPlan?: { minutes: 20, willing: "想学", count: 5, custom: "想练几何" },
    // report 模式专用：
    quiz?: { questions: [...], answers: { qid: "用户答案" } }
  },
  options: { deepThinking?: boolean, temperature?: number, webSearch?: boolean } // webSearch 仅内部使用，前端永远不传 false
}
```

### AI 流事件（`ipcRenderer.on('ai:event')`）
```js
{ requestId, type: "start", mode, model }
{ requestId, type: "status", status: "searching"|"retrieving"|"thinking"|"writing", text: "正在联网搜索…" }
{ requestId, type: "search", ok: boolean, provider: string, results: [{title,url,snippet}], error?: string }
{ requestId, type: "reasoning", delta: string }
{ requestId, type: "content", delta: string }
{ requestId, type: "usage", promptTokens, completionTokens }
{ requestId, type: "done", text: string, reasoning: string, search: {ok, provider, results}, json?: any /*quiz/report 解析后的对象*/, fallback?: boolean }
{ requestId, type: "error", message: string, code: "no_config"|"auth"|"network"|"parse"|"aborted"|"unknown" }
```

**重要**：前端收到 `done` 后，`json` 字段可能为 `null`（模型没按 JSON 输出或解析失败）；此时若 `fallback === true`，主进程已经用内置题库/本地统计兜底，前端照常渲染 `json`。

## 3. 主进程能力（前端不需要关心细节，但 UI 要体现）

1. **防幻觉**：每次请求拼接 system prompt（角色 / 教材版本 / 学生档案 / 成绩 / 今日日期 / 规则：优先依据参考资料、不确定就说不确定、禁止编造、引用标注）；同时检索内置教材与用户材料的片段作为 `<reference>` 注入。
2. **联网搜索始终开启**：每次请求先做一次联网检索（Bing HTML 兜底，或用户配置的 Tavily/Serper/博查），把结果注入，并在事件流里告知前端。搜索失败时 `search.ok=false`，UI 必须显示"本轮联网检索失败"，不得假装成功。
3. **流式输出**：解析 OpenAI 兼容 SSE（`data: {...}`），支持 `choices[0].delta.content`、`delta.reasoning_content`、`delta.reasoning`。
4. **深度思考**：开启时请求体附加 `reasoning_effort: "high"`（非 OpenAI 兼容服务可能忽略），并解析 reasoning 事件。
5. **JSON 模式**：quiz/report/plan 通过严格提示词 + 解析器；解析失败走本地兜底（题库 / 规则报告）并标记 `fallback: true`。
6. **离线/未配置 API**：`error.code === "no_config"`，前端引导去设置页。

## 4. 前端页面与必需交互（验收清单）

左侧固定侧边栏导航，右侧主内容区。页面（哈希路由或状态切换）：
1. `#/home` 学习台：问候 + 今日安排 + 快捷开始练习 + 进度概览 + 最近报告 + 每日询问卡片（仅当开启且今天没登记时出现）
2. `#/quiz` 练习：科目选择 → 时间（10/15/20/30 分钟 + 自定义输入）→ 意愿（想学/一般/不太想 + 自定义输入）→ 生成题目 → 逐题作答 → 提交 → 进入报告
3. `#/report` 报告：历史报告列表 + 详情（正确率、薄弱点、建议、鼓励，来源引用）
4. `#/progress` 学习进度：各科进度自定义（章节/单元 + 百分比 + 备注）、请假登记、补课计划、自定义学习安排、每日询问设置
5. `#/library` 资料库：内置教材（可阅读正文）+ 我的材料（上传/删除/预览）+ 上传入口（始终可用）
6. `#/assistant` AI 助手：多轮对话、流式、深度思考开关、联网搜索状态、图片/材料附件、引用来源
7. `#/settings` 设置：API 配置、个人信息、考试成绩（每科跳过按钮）、教材版本（展示固定规则）、行为偏好、数据目录

**首启引导**：若未配置 API 或未填个人信息，进入 `#/welcome` 引导页（3 步：API → 个人 → 成绩/教材确认 → 开始学习）。

**必须实现的细节**
- 成绩页每科一行：分数输入、满分输入、明确的「语文跳过」按钮；跳过态清晰可见；不允许 0 表示跳过；支持撤销跳过。
- 教材版本固定展示：语文人教版 / 数学浙教版 / 英语人教版 / 科学教科版 / 社会=道法+历史+地理（均人教版）；注明"浙江科学合并物化生"。
- 练习时长与意愿必须同时支持"选项按钮"与"自定义输入"。
- AI 回复区：流式打字、reasoning 折叠区（深度思考开启时）、停止生成按钮、复制。
- 联网搜索徽标常驻显示（"联网搜索：已开启"），不可关闭。
- 上传按钮在所有相关页面都可用（资料库、助手、设置、练习）。
- 空状态、错误状态、加载状态都要有设计。
- 键盘：Ctrl+Enter 发送；Esc 关闭弹窗。

**UI 风格**：现代教育风，浅色为默认（另支持深色），主色 #5B6CFF 系，圆角 14-18px，柔和阴影，卡片化，左侧栏 240px，中文系统字体栈，字号 13-15px。禁止外网字体/图片。所有图标内联 SVG。

## 5. 文件所有权（避免并发写冲突）

| 文件 | 所有者 |
| --- | --- |
| `index.html`, `styles.css`, `renderer.js` | 前端 |
| `main.js`, `preload.js`, `lib/**` | 主进程（Lead） |
| `assets/textbooks/**`, `assets/quizbank/**` | 内容 |
| `package.json`, `build/**`, `dist/**` | Lead |

## 6. 验收自检（前端）

- [ ] `window.api` 未就绪时不崩（显示"初始化中"）
- [ ] 所有页面可切换，无 console error
- [ ] 设置能保存并回显（刷新/重启后仍在）
- [ ] 无 API Key 时显示引导，不白屏
- [ ] 窗口 1280×800 与 1024×700 下布局不破
