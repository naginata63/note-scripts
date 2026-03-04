# note-scripts

note.com の記事管理を CLI で自動化する Playwright スクリプト集。

下書き作成・編集・公開・一覧取得をコマンドラインから実行できます。

## 必要環境

- Node.js 18 以上
- Chromium（`npm run install-browsers` でインストール）
- **有人ディスプレイ環境**（headedモード必須。WSL2/Linux でも `DISPLAY` 設定が必要）

## インストール

```bash
git clone https://github.com/naginata63/note-scripts.git
cd note-scripts
npm install
npm run install-browsers
```

## 認証情報の設定

環境変数で note.com のログイン情報を渡します。`.env` ファイルや `~/.bashrc` に設定してください:

```bash
export NOTE_EMAIL="your-email@example.com"
export NOTE_PASSWORD="your-password"
```

## 使い方

### 下書き一覧

```bash
node scripts/note-edit.js --action=list
```

### 下書き作成

```bash
node scripts/note-edit.js --action=create \
  --title="記事タイトル" \
  --body="本文テキスト"
```

### 記事編集

```bash
node scripts/note-edit.js --action=edit \
  --url="https://note.com/username/n/xxxxxxxx" \
  --body="新しい本文"
```

### 記事公開

```bash
node scripts/note-edit.js --action=publish \
  --url="https://note.com/username/n/xxxxxxxx"
```

## 制限事項

- **headedモード専用**: ブラウザウィンドウが表示される環境が必要です
- サーバー環境（ヘッドレス専用）では動作しません
- note.com のUI変更によりセレクタが合わなくなる場合があります

## ファイル構成

```
scripts/
  note-edit.js    # メインスクリプト
  selectors.md    # セレクタ調査メモ（開発者向け参考情報）
```

## ライセンス

MIT
