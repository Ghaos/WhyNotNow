# WhyNotNow リポジトリの指示

## このリポジトリで作業する場合

- WhyNotNow のユーザーフローを変更する前に、`.agents/skills/wnn/SKILL.md` を読むこと。
- WhyNotNow のユーザーフローを変更し、表示されるフローに影響する場合は、`docs/en/dialogue-flowchart.md` を更新すること。
- スキル、サーバー、ストレージの動作に影響し得る変更では、`npm.cmd run check` と `npm.cmd test` を実行すること。配布用 MCP サーバーの更新が必要な場合は、`npm.cmd run build:plugin-server` も実行すること。
- 個人用プラグインの再インストールは、ユーザーから明示的に依頼された場合にのみ行うこと。依頼された場合は、`plugin-creator` のキャッシュバスターと再インストールのフローを使い、新しい Codex タスクで確認すること。

## 開発リファレンス

### 要件

- Node.js 20 以降
- リポジトリスキル対応の Codex

### リポジトリ構成

- `.agents/skills/wnn/` には、ユーザーが呼び出すスキルとその参照資料がある。
- `server/` には、MCP サーバーと永続化キューがある。
- `test/` には、Node のテストランナーで実行するテストがある。
- `out/why-not-now/why-not-now-mcp.mjs` は、個人用 Codex プラグインで使うバンドル済み MCP サーバーである。`out/` は生成物であり、Git 管理しない。

### 検証とビルド

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build:plugin-server
```

`build:plugin-server` は、単体で実行できる `out/why-not-now/why-not-now-mcp.mjs` を含む配布パッケージを生成する。実行時の依存関係はバンドルされるため、インストール済みプラグインには Node.js 20 以降だけが必要である。

### プラグインのパッケージ構成

個人用プラグインは次の構成を持つ。

```text
out/why-not-now/
├─ .codex-plugin/plugin.json
├─ .mcp.json
├─ why-not-now-mcp.mjs
└─ skills/wnn/
```

### 永続化と復旧

`server/index.mjs` の MCP サーバーが永続化の境界を担う。会話ごとに書き込みをキューイングし、楽観的リビジョンチェックを使う。

各会話は、スキルのインストール先とは別のローカル JSON レコードとして保存される。

- Windows: `%LOCALAPPDATA%\\WhyNotNow\\conversations-v4`
- macOS: `~/Library/Application Support/WhyNotNow/conversations-v4`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/WhyNotNow/conversations-v4`

テストでは、一時データを分離するために `WHYNOTNOW_HOME` を使う。

現在の会話スキーマはバージョン 4 である。以前のスキーマは別の保存領域に残し、移行も読み込みも行わない。

`scripts/whynotnow.mjs` は、開発と復旧のためのユーティリティである。UTF-8 JSON 入力または標準入力から `create` と `update` のペイロードを受け取る。

```powershell
node .agents/skills/wnn/scripts/whynotnow.mjs --help
node .agents/skills/wnn/scripts/whynotnow.mjs root
```

## 不変条件

- `$wnn` は保留するタスクを記録する。ユーザーが明示的に **Do it now** を選ぶまで、その元のタスクを開始してはいけない。
- 通常の会話の永続化には `why-not-now` MCP サーバーを使う。ストレージ CLI は開発と復旧専用である。
- ストレージの仕組みをユーザー向け応答に含めない。JSON、パス、識別子、リビジョン、保存・読み込みの成功を表示してはいけない。
- 完全なチャット記録、非公開の推論、認証情報、取得したページ本文、ソースコードの内容を永続化してはいけない。構造化された結果だけを保存する。
- 明示的な調査の選択後に行う読み取り専用調査では、ローカルプロジェクトや外部状態を変更してはいけない。
- `WHYNOTNOW_HOME` はテスト時、またはユーザーが明示的に求めた場合にだけ設定する。
- 生のユーザーテキストを実行可能なシェルコードへ展開してはいけない。
- 開発・復旧ユーティリティで保存済みレコードを直接作成または更新する前に、`.agents/skills/wnn/references/schema.md` を確認する。
