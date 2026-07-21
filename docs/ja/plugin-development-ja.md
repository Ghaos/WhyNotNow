# プラグイン開発と更新

WhyNotNow の開発用ソースはリポジトリ内に置き、配布するプラグインは毎回 `plugins/why-not-now/` に生成する。この生成済みパッケージは Git 配布のために管理する。

## 配布パッケージを生成する

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build:plugin-server
npm.cmd run validate-plugin-package
```

生成される `plugins/why-not-now/` には、プラグインのマニフェスト、MCP 設定、単一の MCP バンドル、実行時に必要なスキルだけが含まれる。

## 個人用プラグインを更新する

Windows では次を実行する。

```powershell
.\scripts\update-and-reinstall-plugin.ps1
```

このスクリプトは、検査済みの配布パッケージを個人用プラグインの導入先へ反映し、Codex 用キャッシュバスターを更新して、個人用マーケットプレイスから再インストールする。

更新後は、必ず新しい Codex タスクでスキルと MCP ツールを確認する。

## CI

GitHub Actions は pull request と `master` への push ごとに、依存関係をクリーンに導入してから、構文検査、テスト、配布パッケージの生成、配布物検査を実行する。
