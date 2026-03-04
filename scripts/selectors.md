# note.com Playwright セレクタ調査報告書

調査日: 2026-03-04
調査方法: Playwright (chromium headless) + note.com JSバンドル静的解析

---

## 重要な構造的発見

note.com のテキスト記事エディタは **2ドメイン構成** になっている:

| ドメイン | 役割 |
|---------|------|
| `note.com` | フロントエンド (Nuxt.js/Vue.js) — ログイン・記事閲覧・投稿フォーム選択 |
| `editor.note.com` | テキスト記事エディタ本体 (Next.js/React + **ProseMirror**) |

**ナビゲーションフロー**:
- `note.com/notes/new` → 未ログイン時: `note.com/login?redirectPath=%2Fnotes%2Fnew` にリダイレクト
- ログイン済みの場合: `editor.note.com/new` (テキスト記事) にリダイレクト
- 既存ノート編集: `editor.note.com/notes/{note_id}/edit`
- 公開設定: `editor.note.com/notes/{note_id}/publish`

---

## 1. ログインページ (`https://note.com/login`)

### ページ構造

```html
<main class="o-login">
  <h1 class="o-login__title">ログイン</h1>
  <div class="o-login__form">
    <!-- ソーシャルログインボタン群 -->
    <ul class="pt-[32px] px-[32px] pb-[24px] flex justify-center gap-8">
      <li><label><button class="a-button p-0" aria-label="Google" ...></li>
      <li><label><button class="a-button p-0" aria-label="X" ...></li>
      <li><label><button class="a-button p-0" aria-label="Apple" ...></li>
    </ul>
    <!-- メール/パスワードフォーム -->
    <div class="o-login__mail">
      <div class="m-formItem m-formGroup o-login__mailField">
        <input id="email" type="text" placeholder="mail@example.com or note ID"
               autocomplete="username" class="a-input a-input--width_fit">
      </div>
      <div class="m-formItem m-formGroup o-login__mailField">
        <input id="password" type="password" aria-label="パスワード"
               autocomplete="current-password" class="a-input a-input--width_fit">
      </div>
    </div>
    <!-- ログインボタン -->
    <div class="o-login__button">
      <button type="button" class="a-button" data-type="primaryNext"
              data-size="medium" data-width="fit"
              disabled (初期状態)>ログイン</button>
    </div>
  </div>
</main>
```

### セレクタ一覧

| 要素 | セレクタ | 備考 |
|------|---------|------|
| メールアドレス入力 | `#email` | `type="text"`, `autocomplete="username"` |
| メールアドレス入力 (alt) | `input[placeholder="mail@example.com or note ID"]` | |
| パスワード入力 | `#password` | `type="password"`, `aria-label="パスワード"` |
| パスワード入力 (alt) | `input[aria-label="パスワード"]` | |
| ログインボタン | `button.a-button[data-type="primaryNext"]` | 初期状態は `disabled` — 入力後に有効化 |
| ログインボタン (alt) | `button:has-text("ログイン")` | Playwright locator |
| Googleログイン | `button[aria-label="Google"]` | |
| Xログイン | `button[aria-label="X"]` | |
| Appleログイン | `button[aria-label="Apple"]` | |

### 重要な注意事項

1. **reCAPTCHA**: サイトキー `6LfQ82wsAAAAAPlaYcARFamCuL741LqmVReCegWG` のreCAPTCHAが実装されている。ログインボタンは入力前は `disabled` 状態。
2. **フォームタグなし**: `<form>` 要素は存在しない (Vue.js コンポーネントによる制御)。
3. **`data-v-*` 属性**: Vue.js のスコープID属性 (`data-v-54c4864e`, `data-v-15a9c7a4` 等) が付与されているが、バージョンにより変わるため **セレクタとして使用しないこと**。
4. **ログインボタン disabled 解除**: メールアドレスとパスワードを両方入力すると `disabled` が外れる。

### Playwright 操作コード例

```typescript
await page.goto('https://note.com/login');
await page.fill('#email', email);
await page.fill('#password', password);
// ボタンが有効化されるまで待機
await page.waitForSelector('button.a-button[data-type="primaryNext"]:not([disabled])');
await page.click('button.a-button[data-type="primaryNext"]');
// ログイン後のリダイレクト待機
await page.waitForURL(url => !url.includes('/login'), { timeout: 15000 });
```

---

## 2. ダッシュボード / 下書き一覧

### URL構造

| URL | 内容 | 認証 |
|-----|------|------|
| `https://note.com/{urlname}/drafts` | ユーザーの下書き一覧 | 要認証 |
| `https://note.com/dashboard` | ダッシュボード (現在は404) | 要認証 |

**確認済みAPIエンドポイント** (GUIではなくAPI):

```
GET /api/v2/creators/{urlname}/contents?kind=note&status=draft
```

- `kind=note` パラメータ必須 (ないと400エラー)
- ページネーション: `?kind=note&status=draft&page=2` 等

### 下書き一覧ページのセレクタ (ログイン必要)

未ログイン状態では調査不可のため、APIベースのアクセスを推奨:

```typescript
// API経由で下書き一覧取得 (page.evaluate内で実行)
const res = await fetch('/api/v2/creators/{urlname}/contents?kind=note&status=draft');
const data = await res.json();
const drafts = data?.data?.contents || [];
// drafts[i].key → note ID, drafts[i].name → タイトル
```

---

## 3. テキスト記事エディタ (`editor.note.com`)

### 3-A. タイトル入力フィールド

エディタ本体は `editor.note.com/new` または `editor.note.com/notes/{id}/edit` で動作。

```jsx
// JSバンドルから抽出されたコンポーネント (React)
<textarea
  placeholder="記事タイトル"
  spellCheck={true}
  value={title}
  onChange={handleChange}
  // styled-components: componentId="sc-80832eb4-0"
/>
```

| 要素 | セレクタ | 備考 |
|------|---------|------|
| タイトル入力 | `textarea[placeholder="記事タイトル"]` | `<textarea>` (自動リサイズ) |
| タイトル入力 (alt) | `.sc-80832eb4-0` | styled-componentsクラス (変動する可能性) |

### 3-B. 本文エディタ (ProseMirror)

本文は **ProseMirror** ベースのリッチテキストエディタ。

```css
/* CSSから確認 */
.ProseMirror { overflow: visible; padding-top: 36px; }
.ProseMirror[data-placeholder]::before {
  content: attr(data-placeholder);
  color: var(--color-text-placeholder);
}
```

| 要素 | セレクタ | 備考 |
|------|---------|------|
| 本文エディタ本体 | `.ProseMirror` | `contenteditable` 属性は子要素にある場合も |
| 本文エディタ (role) | `[role="textbox"].ProseMirror` | ProseMirrorの標準的な実装 |
| 本文エディタ (alt) | `div.ProseMirror` | |

**ProseMirror 操作上の注意**:
- `page.fill()` は使用不可。`page.click()` でフォーカスしてから `page.keyboard.type()` を使用。
- または `page.evaluate()` でProseMirrorのAPIを直接呼び出す。

```typescript
// ProseMirror への入力方法
await page.click('.ProseMirror');
await page.keyboard.type('本文テキスト');
```

### 3-C. 下書き保存ボタン

エディタヘッダーに配置されたドロップダウン付きボタン:

```jsx
// JSバンドルから抽出
<button disabled={isDisabled} onClick={onInstantSave}>
  <img src={userProfileImage} />
  <span>下書き保存</span>
</button>
<button
  aria-haspopup="true"
  aria-label="arrowdropdown"
  onClick={toggleDropdown}
>
  {/* ドロップダウン展開アイコン */}
</button>
```

| 要素 | セレクタ | 備考 |
|------|---------|------|
| 下書き保存ボタン | `button:has-text("下書き保存")` | Playwright locator |
| 下書き保存 (ドロップダウン矢印) | `button[aria-label="arrowdropdown"]` | 保存先変更用 |

**ボタンテキストの動的変化**:
- 保存中: `"保存中"`
- 公開済み記事: `"一時保存"`
- 下書き: `"下書き保存"`

キーボードショートカット: `Cmd+S` (macOS) / `Ctrl+S` (Windows/Linux)

### 3-D. 公開ボタン

```jsx
// JSバンドルから抽出
<button
  variant={canPublish ? "primary" : "basic"}
  onPress={onPublishButtonClick}
>
  {isSubmitting ? "保存中" : "公開に進む"}
</button>
```

| 要素 | セレクタ | 備考 |
|------|---------|------|
| 公開に進むボタン | `button:has-text("公開に進む")` | Playwright locator |
| 公開ボタン (無効時) | `button:has-text("公開に進む")[disabled]` | タイトル未入力時は disabled |

**前提条件**: タイトルと本文のどちらかが入力されていないと `disabled` になる。
エラーメッセージ: `"タイトル、本文を入力してください"`

### 3-E. ツールバー (書式設定)

| ツール | aria-label |
|--------|-----------|
| 大見出し | `aria-label="大見出し"` |
| 小見出し | `aria-label="小見出し"` |
| 箇条書き | `aria-label="箇条書きリスト"` |
| 番号付きリスト | `aria-label="番号付きリスト"` |
| 引用 | `aria-label="引用"` |
| コード | `aria-label="コード"` |
| 区切り線 | `aria-label="区切り線"` |
| 画像挿入 | `aria-label="画像"` |
| リンク挿入 | `aria-label="リンク"` |
| AIアシスタント | `aria-label="AIアシスタント"` |

---

## 4. 公開設定ページ (`editor.note.com/notes/{id}/publish`)

```
editor.note.com/notes/{note_id}/publish
```

公開フローは別ページ (`/publish`) に遷移する形式。セレクタは `browser_snapshot` で実際のページを確認することを推奨。

---

## 5. セレクタ確認手順 (認証が必要なページ)

認証済みのPlaywright MCPセッション (`~/.cache/ms-playwright/note-profile`) を使用:

```typescript
// ① 既存下書きのエディタURLに直接アクセス
await page.goto(`https://editor.note.com/notes/${noteId}/edit`);

// ② または新規作成
await page.goto('https://editor.note.com/new');
// → editor.note.com/new に直接アクセス可能 (note.com/notes/new は editor.note.com/new にリダイレクト)
```

**Playwright MCP で browser_navigate を使う場合**:
```
browser_navigate('https://editor.note.com/notes/{note_id}/edit')
browser_snapshot()  # アクセシビリティツリーで実際のセレクタを確認
```

---

## 6. まとめ：Playwright実装時の推奨セレクタ

### ログイン

```typescript
// ログイン
await page.fill('#email', email);
await page.fill('input[aria-label="パスワード"]', password);
await page.click('button[data-type="primaryNext"]');
await page.waitForURL(url => !url.includes('/login'));
```

### 下書き作成 (GUI)

```typescript
// editor.note.com/new に直接アクセス (要認証)
await page.goto('https://editor.note.com/new');

// タイトル入力
await page.fill('textarea[placeholder="記事タイトル"]', title);

// 本文入力
await page.click('.ProseMirror');
await page.keyboard.type(body);

// 下書き保存
await page.click('button:has-text("下書き保存")');
// または Cmd+S
await page.keyboard.press('Meta+S');  // macOS
// await page.keyboard.press('Control+S');  // Linux/Windows
```

### 公開

```typescript
// 公開ボタンクリック → 公開設定ページへ遷移
await page.click('button:has-text("公開に進む")');
// 公開設定ページ (editor.note.com/notes/{id}/publish) での操作は
// browser_snapshot で確認してから実装すること
```

---

## 7. 動的要素・注意事項

| 注意点 | 詳細 |
|--------|------|
| **reCAPTCHA** | ログインページに実装。ヘッドレスモードでは自動解決困難。プロファイル (`note-profile`) にセッションを永続化して回避 |
| **ProseMirror** | `page.fill()` 不可。`click()` + `keyboard.type()` を使用 |
| **styled-components クラス** | `sc-*` クラスはビルド時に生成されるため変動する可能性。`placeholder` や `aria-label` での特定を優先 |
| **Vue.js `data-v-*` 属性** | note.com側 (Nuxt.js) の属性。バージョンにより変わるため使用しないこと |
| **editor.note.com** | note.com/notes/new はログイン済みでもeditor.note.comに遷移する |
| **ボタン disabled 状態** | ログインボタン・公開ボタンはいずれも初期状態が `disabled`。入力後に有効化を待ってからクリック |
| **セッション管理** | `~/.cache/ms-playwright/note-profile` に永続セッション保存。Playwright MCP 実行中はプロファイルロック中 |
