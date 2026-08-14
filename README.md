<p align="center"><img src="assets/brand/desktop-cover.svg" alt="DS-Harness Desktop 封面" width="100%"></p>
<p align="center"><a href="README.md">简体中文</a> · <a href="README.en.md">English</a> · <a href="https://ouyangyipeng.github.io/dsh-desktop/">官网</a> · <a href="https://github.com/ouyangyipeng/dsh-desktop/releases/latest">下载</a> · <a href="https://github.com/ouyangyipeng/dsh-marketplace">插件市场</a></p>

# DS-Harness Desktop

**DS-Harness Desktop**（`dsh-desktop`）把官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 体验封装成可直接安装的 macOS 与 Windows 应用。下载 DMG 或 EXE 后即可启动，不要求用户安装 Git、Node.js 或 pnpm。

> 这是非官方的社区维护项目，不是 DeepSeek 官方发布。Harness 的运行时、Web UI 和插件系统仍来自官方仓库。

![DS-Harness Desktop 中的真实 Marketplace 界面](assets/screenshots/desktop-marketplace.png)

## v0.2.0

- 双击应用即启动标准 `dsh web`，无需 clone、命令行或单独浏览器；
- 默认离线内置 [dsh-marketplace v0.1.1](https://github.com/ouyangyipeng/dsh-marketplace/releases/tag/v0.1.1)，可在设置中搜索、检查、安装、更新和卸载 `topic:dsh-plugin` 社区插件；
- Marketplace 完全跟随 DSH 亮色/深色 token，自身作为 Desktop 固定 bundle，不能在市场中误卸载；
- 隔离 `DSH_HOME`、固定 loopback、启动健康检查、进程树回收、脱敏诊断和恢复页；
- About 同时记录 Desktop、官方 Harness、Marketplace 三份 commit 与版本。

## 安装

### macOS

1. 从 [Releases](https://github.com/ouyangyipeng/dsh-desktop/releases/latest) 下载匹配的 `.dmg`；
2. 打开镜像，把 **DS-Harness Desktop** 拖入 **Applications**；
3. 当前社区构建未 notarize。若首次启动被阻止，请在 **系统设置 → 隐私与安全性** 中仅批准这一个应用，再重新打开。

### Windows

下载匹配的 `.exe` 并运行。当前构建未签名；SmartScreen 显示未知发布者时，请先核对 Release 中的 `SHA256SUMS`，确认信任后再通过正常审查入口继续。本项目不会要求关闭 Gatekeeper、SmartScreen、杀毒软件或其他系统安全机制。

## Marketplace 与安全边界

Desktop 内置的是“市场工具”，不是市场中的所有插件。社区插件安装后会以 Harness 宿主权限运行；安装前请检查源码、维护状态、许可和发布内容。Marketplace 禁止安装阶段的仓库生命周期脚本，并只接受预构建且声明标准 DSH bundle 的仓库，但这不等于第三方代码经过官方审计。

```text
dsh web --patch <desktop-owned-overlay> --host 127.0.0.1 --port 0
```

overlay、官方 Harness 和 Marketplace 均随安装包固定。已安装应用不会对 runtime 执行 `git pull`；更新必须通过经过 staging、测试、目标平台打包和 smoke 的 Desktop Release。

| 来源 | v0.2.0 固定方式 |
| --- | --- |
| Desktop | Release tag 与 `desktopCommit` |
| 官方 Harness | `upstream/deepseek-harness` submodule |
| Marketplace | `plugins/dsh-marketplace` submodule，v0.1.1 |

## 开发

```bash
git clone --recursive https://github.com/ouyangyipeng/dsh-desktop.git
cd dsh-desktop
pnpm install --frozen-lockfile
pnpm upstream:bootstrap
pnpm build
pnpm runtime:stage -- --development
pnpm test
pnpm site:check
pnpm run pack -- --development --mac --arm64
```

修改 staging 或发布行为前请阅读[架构说明](docs/architecture.md)、[开发说明](docs/development.md)与[发布说明](docs/releasing.md)。Desktop 壳使用 [Apache License 2.0](LICENSE)，内置组件保留各自许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
