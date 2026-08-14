# DS-Harness Desktop 默认 Marketplace 与品牌升级设计

## 状态

已于 2026-08-14 获得实现批准。本文约束 `dsh-desktop` 对固定版本 `dsh-marketplace` 的离线集成，以及 Desktop 官网、README、Logo、封面、实机截图和鼠标粒子升级。

## 目标

DS-Harness Desktop 在不修改官方 DeepSeek Harness 源码、不接管用户 profile、不依赖首次启动联网的前提下，默认提供 `dsh-marketplace`。用户安装 DMG 或 EXE 后打开标准 Harness Web UI，即可在设置中进入 Marketplace。

Desktop 同时获得完整而独立的品牌入口：中文默认 README、英文切换、原创 Logo、1280 × 640 封面、真实 macOS 应用截图，以及接近官方 DSH 官网氛围但不复制其资产或商标的交互式产品站。

## 依赖与版本所有权

`plugins/dsh-marketplace/` 是指向 `https://github.com/ouyangyipeng/dsh-marketplace.git` 的 Git submodule。Desktop 记录一个不可变 Marketplace release commit；构建身份同时记录 Desktop、官方 Harness 和 Marketplace 的完整 Git SHA 与 Marketplace package version。

Desktop 的上游自动更新只推进 `upstream/deepseek-harness/`。Marketplace 更新使用独立、可审查的 submodule 更新提交。两者均须经过同一 staging、assembled runtime 和 packaged smoke，不能在已安装应用中执行 `git pull`。

发布版预计为 Marketplace `v0.1.1` 与 Desktop `desktop-v0.2.0`。确切 tag 仅在所有验收项通过后创建，已发布 tag 不移动。

## 离线打包

Marketplace 仓库提交可发布的 `lib/index.js`、`lib/client.js`、类型、bundle patch、许可和 README。Desktop staging 校验 Marketplace submodule 已初始化、工作区干净、HEAD 等于父仓库记录的 gitlink、package name 为 `dsh-marketplace`，并拒绝缺失构建产物、越界路径和符号链接。

Staging 将 Marketplace 的发布文件复制到 `dist/stage/node_modules/dsh-marketplace/`。它不复制 `.git`、测试、站点、开发依赖或 Marketplace 自己的 `node_modules`。Marketplace 的 peer dependencies 继续由同一份官方 Harness runtime 提供。

复制后的 `@deepseek-ai/dsh/package.json` 在 stage 内声明精确版本的 `dsh-marketplace` dependency。官方 `healProfilesModuleFallback()` 因此会在 Desktop 专属 `$DSH_HOME/profiles/node_modules` 中建立可解析链接。该修改只发生于产物 staging，不写入官方 Harness submodule。

Desktop stage manifest 也声明相同依赖，以便 Electron 打包器保留该目录。产物不得保留任何开发机绝对路径或符号链接。

## 启动组合

Desktop 资源包含一个只读 overlay，例如 `resources/runtime/dsh-desktop.patch.yml`。它插入 `dsh-marketplace` Host 插件，并配置：

```yaml
- insert:
    - id: dsh-marketplace
      name: dsh-marketplace
      config:
        profile: web
        cacheTtlMs: 600000
        bundledRepositories:
          - ouyangyipeng/dsh-marketplace
```

Supervisor 以 `dsh web --patch <absolute-overlay-path> --host 127.0.0.1 --port 0` 启动 runtime。overlay 在用户 profile 和 home patch 之后应用，因此 Marketplace 本体保持 Desktop 拥有且每次启动都存在；它不修改用户的 `package.json` 或 `cordis.patch.yml`。Marketplace 安装的其他插件仍写入用户的 Desktop 专属 web profile。

开发模式从仓库内的 Marketplace submodule 解析同一个包与 overlay。测试不能依赖发布机的全局 Node、pnpm 或 Git。

## 自我识别与用户行为

Desktop 将 `ouyangyipeng/dsh-marketplace` 传入 Marketplace 的 `bundledRepositories` 配置。Marketplace bootstrap 把该仓库标记为 `bundled`。UI 显示“Desktop 内置”，禁用对 Marketplace 自己的安装、更新和卸载操作，并保留 GitHub 与版本信息。其他插件不受影响。

首次打开 Marketplace 可以联网读取 GitHub `topic:dsh-plugin`；离线时显示缓存或明确的网络失败状态。Desktop 启动本身不等待 Marketplace catalog 网络请求，也不因 GitHub 不可用而失败。

## 品牌资产

Desktop 使用原创几何 Logo：24 × 24 基础网格上的极简窗口轮廓与向前切口，表达“容器 + 启动”。它与 Marketplace Logo 共用线宽、圆角、留白和深海蓝色系，但不能复刻 DeepSeek 鲸鱼或官方 DSH 标记。

仓库内保留可编辑的 SVG，并导出应用和社交预览所需的 PNG/ICNS/ICO。小尺寸版本在 16 px 仍须可辨识。现有应用图标若替换，macOS Dock、DMG、Windows installer、About 和站点必须一致。

Desktop 封面为 1280 × 640：左侧是 Logo、`DS-Harness Desktop`、一句中文价值主张和 macOS/Windows 标签；右侧是从真实应用截取的 Harness 窗口，背景使用深海渐变、粒子轨迹和克制网格。封面包含真实产品画面，不用伪造 UI 文本。

## 官网视觉与动效

保留“Midnight Particle”方向，但提升为更接近官方 DSH 官网的空间感：近黑背景、低饱和蓝色雾层、稀疏亮点、长短不一的连接轨迹、局部高光和大尺度留白。设计是原创实现，不下载或复制官方源码、图像、视频、Logo 或布局。

粒子 Canvas 必须真正响应鼠标：指针位置形成有限半径的引力/排斥场；移动速度生成短暂的蓝色粒子尾迹；邻近粒子才连线；停止移动后能量平滑衰减。指针离开、触控设备或 `prefers-reduced-motion: reduce` 时关闭交互尾迹并降低动画频率。Canvas 使用 device-pixel-ratio 上限和可见性暂停，避免持续高负载。

页面默认中文并提供 English 显式切换。核心区域包括：Hero 与下载、真实 Desktop 截图、默认 Marketplace、运行架构、版本追踪、更新方式、安全边界和开源入口。页面无 JavaScript 时仍可阅读与下载；远程字体、远程图片和第三方 analytics 均不允许。

## README 信息架构

`README.md` 是中文默认入口，`README.en.md` 是英文候选；现有 `README.zh.md` 迁移后删除。两份 README 顶部均先显示品牌封面，再提供语言切换与 Website、Download、Marketplace、Security、Development 导航。

README 必须准确说明：

- Desktop 是社区维护的非官方发行壳；
- 下载 DMG/EXE 后无需 Git、Node.js 或 pnpm；
- 未签名版本的 Gatekeeper/SmartScreen 多点击步骤；
- 默认内置哪个 Marketplace version 和 commit；
- 官方 Harness commit、Desktop commit 与 Marketplace commit 如何追踪；
- 内置 Marketplace 不等于 Marketplace 中所有插件均可信；
- Installed app 只通过经过验证的 Desktop release 更新，不在本机 pull runtime。

README 内嵌真实 macOS 应用截图，并链接 Marketplace 官网与仓库。英文版保留相同事实，不逐段制造额外承诺。

## 实机截图

Desktop 截图必须来自当前构建的 macOS 应用或同一 packaged stage 启动的 Electron 窗口，展示真实标准 Harness Web UI 和可见的 Marketplace 入口。截图前使用隔离 `DSH_HOME`，不得包含 API key、用户姓名、真实本地路径、历史会话或其他敏感信息。

仓库保存原始 PNG 和网页优化 WebP。封面、README 和 Pages 引用仓库内相对路径。截图需在 Retina 清晰度下生成，同时提供可访问的中文 alt text。

## 错误处理

Marketplace submodule 未初始化、脏、gitlink 不匹配、manifest 不合法、版本与 metadata 不一致、构建产物缺失、复制结果含符号链接或 overlay 缺失时，staging 在打包前明确失败并给出修正命令。

运行时如果 overlay 或 Marketplace Host 无法加载，Desktop 沿用现有 recovery page，日志仅显示经脱敏的插件和路径诊断。不能静默回退为“没有 Marketplace”的成功启动，因为发布包承诺默认内置该能力。

## 测试与发布验收

实现遵循 TDD。最低覆盖包括：

- submodule identity、manifest、发布文件白名单和 symlink rejection；
- stage 中 DSH manifest 与 Desktop manifest 的 Marketplace dependency；
- build metadata 的 Marketplace version/commit 解析与展示；
- supervisor 的固定 `--patch` 参数顺序和开发/发布路径；
- assembled runtime `--dump-config` 中存在唯一 `dsh-marketplace` row；
- packaged smoke 启动标准 Web UI，Marketplace bootstrap 和 `client.js` 均成功；
- Desktop 官网结构、中文默认语言、英文入口、真实截图、Logo、封面与粒子 pointer listeners；
- Playwright 在桌面和移动 viewport 检查布局、键盘焦点、reduced motion 与鼠标尾迹；
- macOS DMG 实机启动后 Marketplace 可见，退出后无残留进程；
- Windows x64 与 ARM64 由 CI 构建并执行既有 packaged smoke。

发布顺序为 Marketplace `v0.1.1`，然后 Desktop 更新 submodule 到该 tag 对应 commit，最后发布 `desktop-v0.2.0`。GitHub Pages、README、release notes、包内 metadata 和应用 About 必须显示一致版本。

## 非目标

本次不实现 Apple notarization、Developer ID、Windows Authenticode、silent update、Marketplace 私有 registry、插件签名或评分系统。也不把 Marketplace 合并进 Desktop 源码，不修改官方 Harness submodule，不复制 `dsh-web-ui` 或 DeepSeek 的品牌资产。
