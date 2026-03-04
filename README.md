# note-mcp-server: Claude CodeからNote.comに記事投稿するMCPサーバー

Claude Code（またはMCP対応クライアント）からnote.comへ記事の下書き・公開・編集・検索・一覧取得ができるMCPサーバーです。

## 特徴

- **5つのMCPツール**: 下書き保存・公開・編集・検索・一覧取得
- **非公式API利用**: note.comの公式APIが存在しないため非公式APIを使用（仕様変更の可能性あり）
- **Markdown→HTML変換**: `marked`ライブラリによる自動変換（見出し・太字・リスト・コードブロック・リンク）
- **世界初のnote MCP**: Claude Codeからnote.comを直接操作できる唯一のMCPサーバー
- **セキュアな認証**: 認証情報は環境変数で管理（コードへのハードコード禁止）

## インストール

```bash
git clone <repository-url>
cd note_mcp_server
npm install
npm run build
```

## Claude Code設定方法

`.claude/settings.json` に以下を追記してください：

```json
{
  "mcpServers": {
    "note": {
      "command": "node",
      "args": ["/path/to/note_mcp_server/dist/index.js"],
      "env": {
        "NOTE_EMAIL": "your-email@example.com",
        "NOTE_PASSWORD": "your-password"
      }
    }
  }
}
```

`/path/to/note_mcp_server/dist/index.js` は実際のパスに置き換えてください。

## 環境変数

| 変数名 | 説明 | 必須 |
|--------|------|------|
| NOTE_EMAIL | note.comのメールアドレス | ✅ |
| NOTE_PASSWORD | note.comのパスワード | ✅ |

## MCPツール使用例

### note_create_draft — 記事を下書き保存

Claude Codeでの使用例：

```
note_create_draftツールで以下の記事を下書き保存してください：
タイトル: 「TypeScriptで作るMCPサーバー入門」
本文: （Markdown形式で記事内容）
```

レスポンス例：

```json
{
  "note_id": "abc12345",
  "status": "draft",
  "url": "https://note.com/your_account/n/abc12345"
}
```

---

### note_publish — 下書きを公開

```
note_publishツールで note_id「abc12345」の記事を公開してください。
タイトルと本文も指定してください。
```

レスポンス例：

```json
{
  "note_id": "abc12345",
  "status": "published",
  "url": "https://note.com/your_account/n/abc12345"
}
```

---

### note_search — 記事をキーワード検索（認証不要）

```
note_searchツールで「TypeScript MCP」というキーワードで記事を検索してください。
```

レスポンス例：

```json
{
  "results": [
    {
      "id": "xyz98765",
      "title": "TypeScriptでMCPサーバーを作る方法",
      "url": "https://note.com/author/n/xyz98765",
      "creator": "author_name",
      "likes": 42
    }
  ]
}
```

---

### note_list_drafts — 下書き一覧を取得

```
note_list_draftsツールで自分の下書き一覧を取得してください。
```

レスポンス例：

```json
{
  "drafts": [
    {
      "id": "abc12345",
      "title": "TypeScriptで作るMCPサーバー入門",
      "updated_at": "2026-03-04T10:30:00Z"
    }
  ]
}
```

---

### note_edit — 既存記事を編集

```
note_editツールで note_id「abc12345」の記事のタイトルを
「TypeScriptで作るMCPサーバー完全ガイド」に変更してください。
```

レスポンス例：

```json
{
  "note_id": "abc12345",
  "status": "draft"
}
```

## 注意事項

- **非公式API**: note.comの公式APIではないため、予告なく仕様変更・動作停止の可能性があります
- **reCAPTCHA**: reCAPTCHAが要求された場合はブラウザでnote.comに一度ログインしてから再度お試しください
- **認証情報の管理**: 認証情報は必ず環境変数で管理してください。コードへのハードコードは絶対に行わないでください
- **レート制限**: 短時間に大量のリクエストを行うとレート制限（429エラー）が発生する場合があります
- **自己責任**: 非公式APIの利用はnote.comの利用規約の範囲内で行ってください

## ライセンス

MIT
