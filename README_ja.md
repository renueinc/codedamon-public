<div align="center">

# コードだもん (codedamon)

**ずんだもんと一緒にClaude Codeを使うのだ！**

Claude Codeのチャットインターフェースに、ずんだもんのアバターと音声を搭載。音声入力・音声出力対応。依存パッケージゼロ。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)]()
[![Claude Code](https://img.shields.io/badge/Claude_Code-required-blue)]()

[English](README.md) | [日本語](README_ja.md)

</div>

> **注記:** このリポジトリにはローカル実行用のチャットUI（`server/` + `public/`）のみが含まれています。[codedamon.renue.co.jp](https://codedamon.renue.co.jp) を動かすクラウドバックエンド（認証・課金・レート制限等）は株式会社renueが別途管理しており、本リポジトリには含まれていません。

---

## クイックスタート

**必要なもの:** Node.js 18以上, [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)

```bash
git clone https://github.com/renueinc/codedamon
cd codedamon
bash setup.sh       # 初回セットアップ
bash start.sh       # 起動 → ブラウザが開く
```

これだけ。ずんだもん経由でClaude Codeとチャットできます。

---

## これは何？

Claude Codeにずんだもんアバターを搭載したWebチャットUI。

```
┌─────────────────────────────────────────────────┐
│  ブラウザ (localhost:3456)                       │
│  ┌────────────────────┐  ┌──────────────────┐   │
│  │                    │  │   ずんだもん     │   │
│  │   チャット         │  │   アバター       │   │
│  │   (ストリーミング)  │  │   (アニメーション) │  │
│  │                    │  │                  │   │
│  └────────────────────┘  └──────────────────┘   │
│  [メッセージを入力...           ] [🎤] [送信]   │
└─────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
   claude CLI (ローカル)  TTS API (オプション)
```

### 機能

- **Claude Codeとチャット** — Claude Codeのフルパワーをウェブ UI で
- **ずんだもんアバター** — アイドル・考え中・おしゃべり・喜び・エラーの表情切替
- **音声出力** — ずんだもんがレスポンスを読み上げ（TTS設定が必要）
- **音声入力** — ブラウザの音声認識でメッセージを話して入力
- **セッション維持** — ページ再読み込み後も会話を再開
- **ツール可視化** — Claudeが使うツール（Read, Write, Bash等）を表示
- **依存パッケージゼロ** — Node.js組み込みモジュールのみ

---

## 音声設定（オプション）

音声はオプションです。設定なしでもチャットとアバターは動きます。

### 方法1: Fish Audio（自分のAPIキーを使用）

1. [fish.audio](https://fish.audio) でAPIキーを取得
2. `config/settings.yaml` を編集:

```yaml
tts:
  provider: fish-audio
  fish_audio_key: "your_key"
  fish_audio_model: "your_model_id"
```

3. サーバーを再起動

### 方法2: クラウドプロキシ（マネージド）

近日公開予定。従量課金のマネージドTTSサービス。

---

## 設定

すべての設定は `config/settings.yaml`:

```yaml
port: 3456                    # サーバーポート
cwd: /path/to/your/project    # デフォルト作業ディレクトリ

tts:
  provider: none              # none | fish-audio | cloud
```

---

## 動作要件

| 要件 | バージョン | 確認方法 |
|------|-----------|---------|
| **Node.js** | 18以上 | `node --version` |
| **Claude Code** | 任意 | `claude --version` |

### Claude Codeのインストール

```bash
npm install -g @anthropic-ai/claude-code
```

その他のインストール方法（Homebrew、デスクトップアプリ等）は[公式ドキュメント](https://docs.anthropic.com/en/docs/claude-code/overview)を参照。

---

## トラブルシューティング

### `claude` CLIが見つからない / ENOENTエラー

サーバーは `claude` コマンドを以下の順で検索します:

1. `CLAUDE_PATH` 環境変数（設定されている場合）
2. システムPATH（`which claude`）
3. よくあるインストール先（`/usr/local/bin/claude`、`~/.npm-global/bin/claude` 等）

**デスクトップアプリや特殊な場所にインストールした場合**、パスを明示指定してください:

```bash
# claudeの場所を確認
which claude

# 明示指定して起動
export CLAUDE_PATH=/your/path/to/claude
bash start.sh
```

`~/.bashrc` や `~/.zshrc` に書いておくと毎回設定不要です:

```bash
export CLAUDE_PATH=/Applications/cmux.app/Contents/Resources/bin/claude
```

### ポートが使用中

`config/settings.yaml` でポート番号を変更してサーバーを再起動:

```yaml
port: 3457
```

### Windowsユーザー

`setup.sh` はbashが必要です。代わりに以下の手順を手動で行ってください:

**1. `config/settings.yaml` を作成する**（`config/settings.yaml.example` をコピーするか新規作成）:

```yaml
port: 3456
cwd: C:\作業フォルダのパス

tts:
  provider: cloud   # または none
```

**2. プロジェクトルートに `.env.local` を作成する**:

```
CLOUD_BACKEND_URL=https://your-backend-url
```

> アカウント画面から `.env.zundamon` ファイルをダウンロードした場合は、`.env.local` にリネームしてプロジェクトルートに置いてください。ファイル内の `CLOUD_API_KEY` はログイン後にブラウザへ自動保存されるため、このファイルへの記載は不要です。必要なのは `CLOUD_BACKEND_URL` のみです。

**3. サーバーを起動する**（Git Bash、WSL、またはターミナルから）:

```bash
node server/serve.js --port 3456 --public ./public --config ./config/settings.yaml
```

---

## キャラクター素材

ずんだもんの素材は [zunko.jp](https://zunko.jp/) の公式素材を使用しています。

利用にあたっては [ガイドライン](https://zunko.jp/guideline.html) をご確認ください。

---

## ライセンス

MIT — [LICENSE](LICENSE) を参照
