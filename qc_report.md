# note-mcp-server QCレポート

**task_id**: subtask_197d
**実施日**: 2026-03-04
**担当**: ashigaru3

---

## Phase 1: 軍師コードレビュー（結果・修正内容）

**元レビュー結果**: PASS_WITH_FIXES（3件のissue）

### ISSUE-1 (major) — Set-Cookie複数対応 → **修正済み**

**場所**: `src/note-client.ts:103-106`
**問題**: `setCookieHeader.split(';')[0]` で最初の1つのCookieのみ取得していた。note.comが複数のSet-Cookieを返す場合に認証が失敗する可能性。
**修正内容**: node-fetch v3の `getSetCookie()` を優先使用し、v2用の `raw()['set-cookie']`、標準の `get()` にフォールバックする多段対応に変更。複数Cookieをすべて取得して `;` で結合する。

```typescript
const headersAny = response.headers as any;
let setCookies: string[];
if (typeof headersAny.getSetCookie === 'function') {
  setCookies = headersAny.getSetCookie();
} else if (typeof headersAny.raw === 'function') {
  setCookies = headersAny.raw()['set-cookie'] ?? [];
} else {
  const single = response.headers.get('set-cookie');
  setCookies = single ? [single] : [];
}
if (setCookies.length > 0) {
  this.cookie = setCookies.map((c: string) => c.split(';')[0]).join('; ');
}
```

### ISSUE-2 (minor) — marked同期モード明示 → **修正済み**

**場所**: `src/markdown-to-html.ts:4`
**問題**: `marked(markdown) as string` で marked v9の非同期バリアントが偶発的に発火した場合 `[object Promise]` が送信されるリスク。
**修正内容**: `marked.use({ async: false })` を追加し同期モードを明示的に設定。`marked()` を `marked.parse()` に変更。

```typescript
marked.use({ async: false });
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown) as string;
}
```

### ISSUE-3 (minor) — fetchタイムアウト追加 → **修正済み**

**場所**: `src/note-client.ts` 全fetchリクエスト
**問題**: タイムアウト未設定でnote.comが応答しない場合にMCPサーバーが無期限ハング。
**修正内容**: `fetchWithTimeout()` ユーティリティ関数を追加（30秒タイムアウト）。全5つのfetch呼び出しを置換。

### 追加修正 — TypeScriptビルドエラー対応

ビルド時に発覚した型エラーを修正（軍師レビュー外のビルド問題）:
- `note-client.ts`: `Response` 型をnode-fetchの `FetchResponse` として明示import
- `tools.ts`: ローカル `ToolResult` 型をMCP SDK v1.27.1の `CallToolResult` 型に置換
- `index.ts`: top-level `await` を IIFE でラップ（`"module": "commonjs"` 制約対応）

---

## Phase 2: npm install + build結果

```
npm install → 完了（0 vulnerabilities）
npm run build (tsc) → 成功（エラー0件）
```

**結果**: ✅ PASS

---

## Phase 3: 検索APIテスト（実API）

**テストクエリ**: "AI副業"
**エンドポイント**: `https://note.com/api/v3/searches?context=note&q=AI%E5%89%AF%E6%A5%AD&page=1`
**認証**: 不要（パブリックAPI）

**実行結果**:
```
SUCCESS: found 4 results
First result: {
  "id": "n75a87339fdc3",
  "title": "Google FlowでNano Banana 2をつかってみた！...",
  "url": "https://note.com/n/n75a87339fdc3",
  "creator": "Makari｜AIイラストと副業",
  "likes": 0
}
```

**結果**: ✅ PASS（リアルタイムデータ取得成功、4件返却）

---

## Phase 4: モックテスト結果

**ファイル**: `test/integration.test.ts`
**実行コマンド**: `npx ts-node test/integration.test.ts`
**注記**: テストはinline stubを使用（APIキー不要）

```
[1] markdownToHtml() ユニットテスト
[2] NoteClient エラーハンドリングテスト
[3] MCPツール入力バリデーションテスト

結果: 13 passed, 0 failed
```

| テスト | 結果 |
|--------|------|
| # 見出し1 → h1 | ✅ |
| ## 見出し2 → h2 | ✅ |
| ### 見出し3 → h3 | ✅ |
| **太字** → strong | ✅ |
| - リスト → li | ✅ |
| 複合Markdown変換 | ✅ |
| NOTE_EMAIL未設定エラー | ✅ |
| NOTE_PASSWORD未設定エラー | ✅ |
| note_create_draft: title空エラー | ✅ |
| note_create_draft: titleスペースのみ | ✅ |
| note_create_draft: title有効 | ✅ |
| note_publish: note_id空エラー | ✅ |
| note_publish: note_id有効 | ✅ |

**結果**: ✅ PASS（13/13）

---

## Phase 5: エラーケース確認（コードレビュー）

| シナリオ | コード箇所 | 判定 |
|---------|-----------|------|
| NOTE_EMAIL未設定 | `note-client.ts:82` `throw new Error('NOTE_EMAIL または NOTE_PASSWORD...')` | ✅ PASS |
| NOTE_PASSWORD未設定 | 同上（両方チェック） | ✅ PASS |
| 無効なnote_idでedit | `handleErrorResponse()` 401→認証失敗, 404→仕様変更メッセージ | ✅ PASS |

全3ケース：適切なエラーメッセージが日本語で返される。

---

## 総合判定: **PASS**

| Phase | 結果 |
|-------|------|
| Phase 1: 軍師コードレビュー修正 | ✅ PASS（3件全修正済み） |
| Phase 2: npm build | ✅ PASS |
| Phase 3: 検索APIテスト | ✅ PASS（4件取得） |
| Phase 4: モックテスト | ✅ PASS（13/13） |
| Phase 5: エラーケース確認 | ✅ PASS |

---

## 注記

- 認証が必要なテスト（下書き作成・公開・編集・下書き一覧）は殿のアカウント情報（`NOTE_EMAIL`, `NOTE_PASSWORD`）提供後に実施予定
- ISSUE-1の修正（複数Set-Cookie対応）はnote.comの実際のログインレスポンスで最終検証が必要
- MCP SDK v1.27.1はpackage.jsonの `^1.0.0` より大幅に新しいバージョンが入っており、型定義の互換性対応が必要だった
