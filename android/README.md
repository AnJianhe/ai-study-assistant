# AI 学习助手安卓测试版

这是与 Windows 桌面版并行的安卓版本。界面、内置教材和题库随 APK 一起安装；学习记录保存在手机应用的私有空间。安卓和 Windows 数据**不会自动同步**。

## 安装

将签名后的 APK 传到安卓手机，打开安装；如系统要求，允许当前文件管理器安装未知来源应用。应用声明的最低系统版本为 Android 6.0（API 23）；还需要较新的 Android System WebView，建议保持更新。不同厂商的兼容性需要实际验证。

## 使用和隐私

- 首次启动时配置自己的 OpenAI 兼容模型接口。安卓端仅允许 HTTPS 接口；AI 使用需要联网。
- 联网搜索默认开启，可以在设置中关闭。点击停止时会同时取消尚在进行的搜索；已经发送的数据无法撤回。
- 成绩、学习进度、设置和上传资料保存在应用私有空间；调用 AI 时，相关个人信息、答案、所选资料或图片会发送给你配置的模型服务商。开启搜索时，搜索词会发送给搜索服务商。API Key 保存在应用私有空间中，**没有承诺硬件级加密**，请勿将设备或数据交给不可信的人。
- 为避免静默发送个人资料，安卓端需要在对话或练习里明确选择资料，未选中的私有材料不会自动加入 AI 请求。
- 图片及所选文件单次合计不超过 12 MiB；单次模型请求编码后不超过 32 MiB。图片支持 PNG、JPEG、WEBP、GIF、BMP；多选中有不支持或超额的项目时，请缩小范围重新选择。
- `.docx`、`.pptx`、`.xlsx` 会在手机本地提取文字，复杂排版、图片或纯图片文档可能无法完整转换；PDF 和旧版 Office 请先截图或复制文字。解析有文件大小、解压大小和文本长度限制。
- 每日询问是应用内提示，不会在后台发送系统通知；退出或系统回收应用可能中断生成，未提交的答案、草稿或当前文件选择可能丢失。
- **卸载应用可能删除手机上的全部本地数据。** 当前测试版不支持从应用内导出备份或将 Windows 数据迁移到手机，请不要把它作为唯一的数据副本。
- 请求超时在不同安卓网络环境中的行为仍需进一步验证；不要依赖设置的超时时间作为严格的总时限。

## 开发与验证

需要 JDK 17、Android SDK Platform 35、Android Build Tools、Gradle 8.7 和 Node.js。项目使用 Android Gradle Plugin 8.5.2。可在项目的 `android` 目录运行：

```powershell
gradle :app:assembleDebug -PstudyNode=C:\path\to\node.exe
```

构建任务会自动运行 `scripts/sync-assets.js`，将固定白名单的前端、教材、题库和业务代码复制到 `app/build/generated/studyAssets`，不会读取桌面版真实用户数据。

在项目根目录使用合成数据运行测试：`node --test android/tests/bridge.test.js`、`node android/tests/image-retrieval.test.js`、`node android/tests/search-abort.test.js`、`node android/tests/sse-release.test.js`。`OfficeConverterTest.java` 覆盖 Office 提取和安全边界；`ui-smoke.js` 在隔离的 Electron 进程模拟手机视口，但不能替代 Android 设备测试。

正式签名密钥应留在开发者本机的私有位置并安全备份，**不要提交到公开仓库**。遗失签名密钥可能导致后续 APK 无法覆盖升级。
