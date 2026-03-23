#!/usr/bin/env node
'use strict';

/**
 * note-edit.js — Playwright headed-mode CLI for note.com editing
 *
 * Usage:
 *   node scripts/note-edit.js --action=login                              # 手動ログイン（初回セットアップ）
 *   node scripts/note-edit.js --action=create --title="タイトル" --body="本文"
 *   node scripts/note-edit.js --action=edit --url="https://note.com/xxx/n/yyy" --body="新しい本文"
 *   node scripts/note-edit.js --action=publish --url="https://note.com/xxx/n/yyy"
 *   node scripts/note-edit.js --action=list [--username=naginata63]
 *
 * Authentication:
 *   - 自動ログイン: NOTE_EMAIL / NOTE_PASSWORD 環境変数をセット
 *   - 各操作前に ensureLoggedIn() でログイン状態チェック → 未ログインなら自動ログイン
 *   - セッション永続化: ~/.cache/ms-playwright/note-cli-profile
 *   - 環境変数未設定の場合: --action=login で手動ログイン
 *
 * PROHIBITED: fetch(), XHR, internal API calls. All operations are GUI-only.
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');

// CLI専用プロファイル（Playwright MCP serverのnote-profileと競合しない）
// デフォルトは固定パス。別環境で使う場合は環境変数 NOTE_PROFILE_DIR でoverride可能
const USER_DATA_DIR = process.env.NOTE_PROFILE_DIR || '/home/murakami/.cache/ms-playwright/note-cli-profile';

// Parse CLI arguments: --key=value or --flag
const args = {};
process.argv.slice(2).forEach(arg => {
  const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
  if (match) {
    args[match[1]] = match[2] !== undefined ? match[2] : true;
  }
});

async function main() {
  const action = args.action;
  if (!action) {
    console.error('Usage: node note-edit.js --action=<login|create|edit|publish|list> [options]');
    console.error('  login:   手動ログイン（初回またはセッション切れ時）');
    console.error('  create:  --title="..." [--body="..." | --body-file="path/to/file.md"] [--cover-image="path/to/cover.png"] [--image-file="path/to/image.png"] [--hashtags="AI,YouTube,切り抜き"]');
    console.error('  edit:    --url="https://note.com/xxx/n/yyy" [--body="..." | --body-file="path/to/file.md"] [--image-file="path/to/image.png"] [--hashtags="AI,YouTube,切り抜き"]');
    console.error('  publish: --url="https://note.com/xxx/n/yyy"');
    console.error('  list:    [--username=naginata63]');
    console.error('');
    console.error('Env vars: NOTE_EMAIL, NOTE_PASSWORD (自動ログイン用)');
    console.error('Markdown mode: --body-file で .md ファイルを指定するとリッチテキスト変換（h2/h3/bold/link/quote/list対応）');
    process.exit(1);
  }

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    locale: 'ja-JP',
    viewport: { width: 1280, height: 800 },
  });

  try {
    const page = await context.newPage();

    switch (action) {
      case 'login':
        await loginAction(page);
        break;
      case 'create':
        await ensureLoggedIn(page);
        if (args['body-file']) {
          const mdContent = fs.readFileSync(args['body-file'], 'utf-8');
          await createDraft(page, args.title || '', '', { markdownContent: mdContent });
        } else {
          await createDraft(page, args.title || '', args.body || '');
        }
        if (args['cover-image']) {
          const absPath = require('path').resolve(args['cover-image']);
          await setCoverImage(page, absPath);
        }
        if (args['image-file']) {
          await uploadImage(page, args['image-file']);
        }
        if (args['hashtags']) {
          await setHashtags(page, args['hashtags']);
        }
        break;
      case 'edit':
        if (!args.url) { console.error('Error: --url is required for edit'); process.exit(1); }
        await ensureLoggedIn(page);
        if (args['body-file']) {
          const mdContent = fs.readFileSync(args['body-file'], 'utf-8');
          await editNote(page, args.url, '', { markdownContent: mdContent });
        } else {
          await editNote(page, args.url, args.body || '');
        }
        if (args['cover-image']) {
          const absPath = require('path').resolve(args['cover-image']);
          await setCoverImage(page, absPath);
        }
        if (args['image-file']) {
          await uploadImage(page, args['image-file']);
        }
        if (args['hashtags']) {
          await setHashtags(page, args['hashtags']);
        }
        break;
      case 'publish':
        if (!args.url) { console.error('Error: --url is required for publish'); process.exit(1); }
        await ensureLoggedIn(page);
        await publishNote(page, args.url);
        break;
      case 'list':
        await ensureLoggedIn(page);
        await listDrafts(page, args.username);
        break;
      default:
        console.error(`Unknown action: ${action}`);
        process.exit(1);
    }
  } finally {
    await context.close();
  }
}

/**
 * ensureLoggedIn(page)
 * Check login state via redirect detection. If redirected to login page, auto-login.
 * Returns true if logged in (or login succeeded), false if login failed.
 */
async function ensureLoggedIn(page) {
  // NOTE_EMAIL/NOTE_PASSWORDが未設定の場合のwarning
  if (!process.env.NOTE_EMAIL || !process.env.NOTE_PASSWORD) {
    console.warn('[auth] WARNING: NOTE_EMAIL / NOTE_PASSWORD が未設定。~/.bashrcをsource済みか確認してください。');
  }

  // editor.note.comにアクセスしてリダイレクト先で判定
  await page.goto('https://editor.note.com', { waitUntil: 'networkidle', timeout: 30000 });
  const currentUrl = page.url();

  // ログインページにリダイレクトされたか確認
  const needsLogin = currentUrl.includes('note.com/login') ||
                     currentUrl.includes('accounts.note.com') ||
                     currentUrl.includes('/sign_in');

  if (!needsLogin) {
    console.log('[auth] ログイン済み（セッション有効）— スキップ');
    return true;
  }

  console.log('[auth] セッション切れ — ログイン実行');
  // ログインフォームへ遷移
  await page.goto('https://note.com/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // フォーム要素を複数セレクタで検出
  const emailField = await page.$('input[name="email"]') ||
                     await page.$('input[type="email"]') ||
                     await page.$('input[name="login"]') ||
                     await page.$('#email') ||
                     await page.$('input[placeholder*="メール"]');

  if (!emailField) {
    console.log('[auth] WARNING: ログインフォームが見つかりません。3秒後にリトライ...');
    await page.waitForTimeout(3000);
    const retryField = await page.$('input[name="email"]') ||
                       await page.$('input[type="email"]') ||
                       await page.$('input[name="login"]');
    if (!retryField) {
      console.log('[auth] ERROR: ログインフォームが見つかりませんでした');
      return false;
    }
    await retryField.fill(process.env.NOTE_EMAIL || '');
  } else {
    await emailField.fill(process.env.NOTE_EMAIL || '');
  }

  const passwordField = await page.$('input[name="password"]') ||
                        await page.$('input[type="password"]') ||
                        await page.$('#password');
  if (!passwordField) {
    console.log('[auth] ERROR: パスワードフィールドが見つかりません');
    return false;
  }
  await passwordField.fill(process.env.NOTE_PASSWORD || '');
  await page.keyboard.press('Enter');

  // ログイン完了を待つ
  try {
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    // タイムアウトは無視（SPA遷移で発火しない場合あり）
  }
  await page.waitForTimeout(2000);

  // ログイン成功確認
  const afterUrl = page.url();
  if (afterUrl.includes('note.com/login') || afterUrl.includes('sign_in')) {
    console.log('[auth] ERROR: ログイン失敗（ログインページに留まっています）');
    return false;
  }
  console.log('[auth] ログイン成功');
  return true;
}

/**
 * performLogin(page)
 * Execute login. Uses NOTE_EMAIL/NOTE_PASSWORD env vars if available.
 * Otherwise waits for manual input (headed mode — user can see the browser).
 */
async function performLogin(page) {
  const email = process.env.NOTE_EMAIL;
  const password = process.env.NOTE_PASSWORD;

  // Navigate to login page if not already there
  if (!page.url().includes('/login')) {
    await page.goto('https://note.com/login');
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  }

  if (email && password) {
    console.log('[auth] 環境変数からメール/パスワードを使用して自動ログイン...');

    // Fill email
    await page.waitForSelector('#email', { timeout: 15000 });
    await page.fill('#email', email);
    console.log('[auth] メール入力完了');

    // Fill password — try #password first, then aria-label fallback
    const pwdSelector = await page.$('#password') ? '#password' : 'input[aria-label="パスワード"]';
    await page.fill(pwdSelector, password);
    console.log('[auth] パスワード入力完了:', pwdSelector);

    // Wait briefly for button to become enabled, then click regardless
    await page.waitForTimeout(1000);
    const btn = await page.$('button.a-button[data-type="primaryNext"]');
    if (btn) {
      const isDisabled = await btn.isDisabled();
      if (isDisabled) {
        console.log('[auth] ボタンがdisabled — 再試行中...');
        await page.fill('#email', email);
        await page.fill(pwdSelector, password);
        await page.waitForTimeout(2000);
      }
      await btn.click();
      console.log('[auth] ログインボタンクリック');
    } else {
      // Fallback: try text-based selector
      await page.click('button:has-text("ログイン")');
    }

    // Wait for redirect away from login page
    try {
      await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 30000 });
      console.log('[auth] 自動ログイン成功:', page.url());
    } catch (_) {
      console.log('[auth] 自動ログイン待機中... reCAPTCHAが表示されている場合は手動で完了してください');
      await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 120000 });
      console.log('[auth] ログイン成功:', page.url());
    }
  } else {
    console.log('[auth] NOTE_EMAIL/NOTE_PASSWORD が未設定です。');
    console.log('[auth] ブラウザで手動ログインしてください（最大3分待機）...');
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 180000 });
    console.log('[auth] 手動ログイン成功:', page.url());
  }

  // Brief wait for session cookies to be written
  await page.waitForTimeout(1000);
}

/**
 * loginAction(page)
 * --action=login: Open browser on login page, complete login, save session.
 */
async function loginAction(page) {
  const email = process.env.NOTE_EMAIL;
  const password = process.env.NOTE_PASSWORD;

  console.log('[login] プロファイル保存先:', USER_DATA_DIR);

  if (email && password) {
    console.log('[login] NOTE_EMAIL/NOTE_PASSWORD が設定済み。自動ログインを試みます...');
    await page.goto('https://note.com/login');
    await performLogin(page);
  } else {
    console.log('[login] ブラウザを開きます。メールアドレスとパスワードを入力してログインしてください。');
    await page.goto('https://note.com/login');
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    console.log('[login] ログイン完了後、このプロセスが自動終了します（最大3分）...');
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 180000 });
    console.log('[login] ログイン成功:', page.url());
  }

  await page.waitForTimeout(2000);
  console.log('[login] セッションをプロファイルに保存しました。');
  console.log('[login] 次回から --action=create などが使えます。');
}

/**
 * createDraft(title, body, options)
 * Navigate to editor.note.com/new, fill title and body, save as draft.
 * options.markdownContent: if set, use Markdown-to-richtext conversion instead of plain body.
 * Returns: { noteId, noteUrl }
 */
async function createDraft(page, title, body, options = {}) {
  console.log('[create] 新規記事エディタを開きます...');
  // note.com/notes/new経由でアクセスするとeditor.note.comへの認証付きリダイレクトが発生
  await page.goto('https://note.com/notes/new');
  // Wait for redirect chain to complete: note.com/notes/new → editor.note.com/new → editor.note.com/notes/{id}/edit
  // Must wait for /notes/{id}/edit URL (not just editor.note.com) to ensure the note ID is assigned
  // and the editor is fully initialized before filling title/body.
  await page.waitForURL(/editor\.note\.com\/notes\/[a-z0-9]+\/edit/, { timeout: 30000 });
  console.log('[create] エディタ読み込み完了:', page.url());

  // Fill title
  await page.waitForSelector('textarea[placeholder="記事タイトル"]', { timeout: 15000 });
  await page.fill('textarea[placeholder="記事タイトル"]', title);

  // Fill body via ProseMirror (page.fill() does not work on ProseMirror)
  await page.waitForSelector('.ProseMirror', { timeout: 10000 });
  await page.click('.ProseMirror');
  await page.waitForTimeout(300);
  if (options.markdownContent) {
    console.log('[create] Markdownモードで本文を入力します...');
    await applyMarkdownToEditor(page, options.markdownContent);
  } else {
    await page.keyboard.type(body);
  }

  // Wait for any async editor operations to complete before saving (e.g. link URL parsing)
  if (options.markdownContent) {
    await page.waitForTimeout(1000);
  }

  // Save draft: click the "下書き保存" button (Ctrl+S does not trigger server-side save)
  const saveBtn = await page.$('button:has-text("下書き保存")');
  if (saveBtn) {
    await saveBtn.click({ force: true });
  } else {
    // Fallback to Ctrl+S if button not found
    await page.keyboard.press('Control+S');
  }
  await page.waitForTimeout(3000);

  const url = page.url();
  console.log('[create] 下書き保存完了。エディタURL:', url);

  // Extract note ID
  const match = url.match(/\/notes\/([a-z0-9]+)/);
  const noteId = match ? match[1] : null;
  if (noteId) {
    const noteUrl = `https://note.com/n/${noteId}`;
    console.log('[create] Note ID:', noteId);
    console.log('[create] Note URL:', noteUrl);
    return { noteId, noteUrl };
  } else {
    console.log('[create] Note IDをURLから取得できませんでした:', url);
    return null;
  }
}

/**
 * editNote(url, newBody, options)
 * Open note in editor, clear body, type new body, save.
 * options.markdownContent: if set, use Markdown-to-richtext conversion.
 */
async function editNote(page, url, newBody, options = {}) {
  const editorUrl = toEditorUrl(url);
  console.log('[edit] エディタを開きます:', editorUrl);
  await page.goto(editorUrl);
  await page.waitForURL(/editor\.note\.com\/notes\/[a-z0-9]+\/edit/, { timeout: 30000 });

  // Wait for ProseMirror editor
  await page.waitForSelector('.ProseMirror', { timeout: 15000 });
  await page.click('.ProseMirror');
  await page.waitForTimeout(300);

  const hasNewContent = options.markdownContent || (newBody && newBody.length > 0);

  if (hasNewContent) {
    // Select all and delete existing content
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // フォーカス再取得（Ctrl+A+Delete後にProseMirrorのフォーカスが失われる問題対策）
    await page.click('.ProseMirror');
    await page.waitForTimeout(300);
    const hasFocus = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror');
      return pm && (pm === document.activeElement || pm.contains(document.activeElement));
    });
    if (!hasFocus) {
      console.log('[edit] WARNING: フォーカス喪失。再取得...');
      await page.focus('.ProseMirror');
      await page.waitForTimeout(300);
    }

    // Type new body
    if (options.markdownContent) {
      console.log('[edit] Markdownモードで本文を入力します...');
      await applyMarkdownToEditor(page, options.markdownContent);
    } else {
      await page.keyboard.type(newBody);
    }

    if (options.markdownContent) {
      await page.waitForTimeout(1000);
    }
  } else {
    console.log('[edit] 本文指定なし — 既存本文を保持します');
  }

  // Save: click the "下書き保存" button (Ctrl+S does not trigger server-side save)
  const saveBtn = await page.$('button:has-text("下書き保存")');
  if (saveBtn) {
    await saveBtn.click({ force: true });
  } else {
    await page.keyboard.press('Control+S');
  }
  await page.waitForTimeout(3000);

  console.log('[edit] 保存完了:', page.url());
}

/**
 * setHashtags(page, hashtags)
 * Set hashtags in the note editor's tag input panel.
 * hashtags: comma-separated string like "AI,YouTube,切り抜き"
 *
 * note.com's tag input is accessible via the right-side settings panel.
 * The panel may need to be opened by clicking a settings toggle button.
 */
async function setHashtags(page, hashtags) {
  const tagList = hashtags.split(',').map(t => t.trim()).filter(t => t);
  if (tagList.length === 0) return;
  console.log('[hashtag] ハッシュタグ設定:', tagList);

  // Selectors for the tag input field (note.com uses various layouts)
  const tagInputSelectors = [
    'input[placeholder*="タグ"]',
    'input[placeholder*="ハッシュタグ"]',
    'input[placeholder*="tag"]',
    'input[placeholder*="Tag"]',
  ];

  // Helper: try to find tag input using given selectors
  async function findTagInput() {
    for (const sel of tagInputSelectors) {
      const el = await page.$(sel);
      if (el) return el;
    }
    return null;
  }

  let tagInput = await findTagInput();

  // If not visible, try clicking common settings/tag panel toggle buttons
  if (!tagInput) {
    const panelSelectors = [
      'button[aria-label*="タグ"]',
      'button[aria-label*="設定"]',
      'button:has-text("タグ")',
      '[data-testid="tag-panel-toggle"]',
      '.n-editor-sidebar__toggle',
    ];
    for (const sel of panelSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          await page.waitForTimeout(800);
          tagInput = await findTagInput();
          if (tagInput) break;
        }
      } catch (_) { /* try next */ }
    }
  }

  if (!tagInput) {
    console.log('[hashtag] WARNING: タグ入力フィールドが見つかりません。スキップします。');
    return;
  }

  for (const tag of tagList) {
    await tagInput.click();
    await page.waitForTimeout(200);
    await tagInput.fill(tag);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    console.log('[hashtag] タグ追加:', tag);
  }

  // Save draft after setting hashtags
  const saveBtn = await page.$('button:has-text("下書き保存")');
  if (saveBtn) {
    await saveBtn.click({ force: true });
    await page.waitForTimeout(2000);
    console.log('[hashtag] タグ設定後の下書き保存完了');
  }
}

/**
 * publishNote(url)
 * Open note, click "公開に進む", then click "公開する" on the publish settings page.
 */
async function publishNote(page, url) {
  const editorUrl = toEditorUrl(url);
  console.log('[publish] 記事を開きます:', editorUrl);
  await page.goto(editorUrl);
  await page.waitForURL(/editor\.note\.com/, { timeout: 20000 });

  // Click "公開に進む" button
  await page.waitForSelector('button:has-text("公開に進む")', { timeout: 15000 });
  await page.click('button:has-text("公開に進む")');

  // Wait for publish settings page
  await page.waitForURL(/\/publish/, { timeout: 15000 });
  console.log('[publish] 公開設定ページ:', page.url());
  await page.waitForTimeout(1500);

  // Try common publish button selectors
  const publishButtonCandidates = [
    'button:has-text("公開する")',
    'button:has-text("投稿する")',
    'button:has-text("公開")',
    'button[type="submit"]',
  ];

  let clicked = false;
  for (const sel of publishButtonCandidates) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        const disabled = await btn.isDisabled();
        if (!disabled) {
          await btn.click();
          clicked = true;
          console.log('[publish] クリック完了:', sel);
          break;
        }
      }
    } catch (_) {
      // try next
    }
  }

  if (!clicked) {
    console.log('[publish] 公開ボタンが見つかりませんでした。');
    console.log('[publish] 現在のURL:', page.url());
    console.log('[publish] 10秒待機します（手動確認可能）...');
    await page.waitForTimeout(10000);
  } else {
    await page.waitForTimeout(3000);
    console.log('[publish] 完了。最終URL:', page.url());
  }
}

/**
 * listDrafts([username])
 * Navigate to https://note.com/notes and extract all user's article titles and URLs.
 *
 * Implementation note: The old URL /username/drafts returns 404 since note.com redesign.
 * The current article management page is at https://note.com/notes.
 * Note items in this page use JS-only buttons (no <a href>), so we intercept the
 * page's own API call (/api/v2/note_list/contents) to extract note keys and build URLs.
 */
async function listDrafts(page, usernameOverride) {
  console.log('[list] 記事一覧を取得中 (https://note.com/notes)...');

  // Capture the note list API response that the page itself makes on load.
  // This is NOT a direct API call — the browser makes it; we just read the result.
  let noteListData = null;
  const onResponse = async (response) => {
    if (response.url().includes('/api/v2/note_list/contents')) {
      try { noteListData = await response.json(); } catch (_) {}
    }
  };
  page.on('response', onResponse);

  await page.goto('https://note.com/notes');
  await page.waitForLoadState('networkidle', { timeout: 20000 });
  page.off('response', onResponse);

  console.log('[list] ページ読み込み完了:', page.url());

  const drafts = [];

  // Strategy 1: use page's own API response data (most reliable)
  if (noteListData && noteListData.data && Array.isArray(noteListData.data.notes)) {
    const notes = noteListData.data.notes;
    let defaultUsername = usernameOverride;
    if (!defaultUsername && notes.length > 0) {
      defaultUsername = notes[0].user.urlname;
    }

    for (const note of notes) {
      // Draft title is in noteDraft.name; published title is in note.name
      const title = (note.noteDraft && note.noteDraft.name) || note.name || '(無題)';
      const key = note.key;
      const urlname = (note.user && note.user.urlname) || defaultUsername || 'unknown';
      const noteUrl = `https://note.com/${urlname}/n/${key}`;
      drafts.push({ title, url: noteUrl });
    }
  }

  // Strategy 2: DOM fallback if API data not captured (titles only, no URL)
  if (drafts.length === 0) {
    const domItems = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.o-articleList__item')).map(item => {
        const titleEl = item.querySelector('.o-articleList__heading');
        return { title: titleEl ? titleEl.textContent.trim() : '(無題)', url: null };
      });
    });
    drafts.push(...domItems);
  }

  if (drafts.length === 0) {
    const pageTitle = await page.title();
    console.log('[list] 記事が見つかりませんでした。ページタイトル:', pageTitle);
  } else {
    console.log(`[list] ${drafts.length}件の記事が見つかりました:`);
    drafts.forEach((d, i) => {
      console.log(`  ${i + 1}. ${d.title}`);
      if (d.url) console.log(`     ${d.url}`);
    });
  }

  return drafts;
}

/**
 * Detect the logged-in username from note.com home page.
 */
async function detectUsername(page) {
  console.log('[list] ユーザー名を自動検出中...');
  await page.goto('https://note.com/');
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 });

  const username = await page.evaluate(() => {
    const SKIP = new Set(['login', 'register', 'new', 'help', 'terms', 'privacy', 'about',
      'search', 'hashtag', 'settings', 'notifications', 'magazines', 'membership',
      'notes', 'drafts', 'dashboard', 'info']);

    // Strategy 1: header/nav links
    for (const link of document.querySelectorAll('header a[href^="/"], nav a[href^="/"]')) {
      const href = link.getAttribute('href');
      if (href && /^\/[a-z0-9_]{2,30}$/i.test(href)) {
        const name = href.slice(1);
        if (!SKIP.has(name)) return name;
      }
    }

    // Strategy 2: any link
    for (const link of document.querySelectorAll('a[href^="/"]')) {
      const href = link.getAttribute('href');
      if (href && /^\/[a-z0-9_]{2,30}$/i.test(href)) {
        const name = href.slice(1);
        if (!SKIP.has(name)) return name;
      }
    }

    return null;
  });

  if (username) {
    console.log('[list] ユーザー名検出:', username);
    return username;
  }

  console.log('[list] ユーザー名を検出できませんでした。フォールバック: naginata63');
  return 'naginata63';
}

/**
 * Convert a note.com public URL to editor.note.com edit URL.
 * https://note.com/xxx/n/abc123 → https://editor.note.com/notes/abc123/edit
 */
function toEditorUrl(url) {
  if (url.includes('editor.note.com')) {
    if (!url.includes('/edit')) {
      return url.replace(/\/?$/, '/edit');
    }
    return url;
  }
  const match = url.match(/\/n\/([a-z0-9]+)/i);
  if (match) {
    return `https://editor.note.com/notes/${match[1]}/edit`;
  }
  return url;
}

// ============================================================
// Markdown to Rich Text Conversion
// ============================================================

/**
 * parseInline(text)
 * Parse inline markdown into segments.
 * Supported: **bold** and [link text](url)
 * Returns: Array<{type: 'text'|'bold'|'link', content: string, url?: string}>
 */
function parseInline(text) {
  const segments = [];
  const pattern = /\*\*(.+?)\*\*|\[(.+?)\]\((.+?)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      // Bold: **text**
      segments.push({ type: 'bold', content: match[1] });
    } else {
      // Link: [text](url)
      segments.push({ type: 'link', content: match[2], url: match[3] });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

/**
 * applyInlineContent(page, text)
 * Type inline content into ProseMirror, applying bold and link formatting.
 * - Bold: type **text** literally → Tiptap input rule converts on closing **
 * - Link: type text → select → Ctrl+K → textarea[placeholder="https://"]
 *
 * Note: Ctrl+B applies bold in note.com's Tiptap editor (confirmed working).
 * Note: Ctrl+K opens the inline link dialog. The toolbar aria-label="リンク" button creates
 *       link CARDS (block elements) and must NOT be used for inline links.
 */
async function applyInlineContent(page, text) {
  const segments = parseInline(text);

  for (const seg of segments) {
    if (seg.type === 'text') {
      if (seg.content) await page.keyboard.type(seg.content);

    } else if (seg.type === 'bold') {
      // Use Ctrl+B shortcut (confirmed working in note.com's Tiptap editor)
      await page.keyboard.press('Control+b');
      await page.waitForTimeout(100);
      await page.keyboard.type(seg.content);
      await page.keyboard.press('Control+b'); // toggle off
      await page.waitForTimeout(100);

    } else if (seg.type === 'link') {
      // Type link text first
      await page.keyboard.type(seg.content);
      await page.waitForTimeout(300);
      // Select the typed text by moving left
      for (let j = 0; j < seg.content.length; j++) {
        await page.keyboard.press('Shift+ArrowLeft');
      }
      await page.waitForTimeout(300);
      // Use Ctrl+K keyboard shortcut to open inline link dialog.
      // NOTE: The toolbar リンク button creates a link CARD (block element) not inline link.
      // Ctrl+K correctly opens the inline URL input while preserving the selection.
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(500);
      // Wait for URL input and scroll it into view using element handle (avoids viewport issues)
      await page.waitForSelector('textarea[placeholder="https://"]', { timeout: 5000 });
      // Use JS focus+value to bypass viewport constraints (popup may be off-screen)
      await page.evaluate((url) => {
        const el = document.querySelector('textarea[placeholder="https://"]');
        if (el) {
          el.focus();
          // Trigger React synthetic event to update state
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          nativeInputValueSetter.call(el, url);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, seg.url);
      await page.waitForTimeout(300);
      // Click the "適用" (Apply) button via JS to bypass viewport constraints.
      await page.evaluate(() => {
        for (const btn of document.querySelectorAll('button')) {
          if (btn.textContent.trim() === '適用') { btn.click(); return; }
        }
      });
      await page.waitForTimeout(500);
      // Move cursor past the link to deselect
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);
    }
  }
}

/**
 * applyMarkdownToEditor(page, markdownText)
 * Parse markdown and apply it to the ProseMirror editor using input rules.
 *
 * Supported syntax:
 *   ## heading   → H2 (大見出し) via "## " input rule
 *   ### heading  → H3 (小見出し) via "### " input rule
 *   > quote      → blockquote via "> " input rule
 *   - item       → bullet list via "- " input rule
 *   **bold**     → bold via Tiptap input rule (type **text** literally)
 *   [text](url)  → link via toolbar button
 *   blank line   → paragraph separator (skipped; Enter×2 after paragraph text handles spacing)
 *
 * Key behavior of note.com editor (confirmed by testing):
 *   - Enter in paragraph → <br> (line break, NOT new paragraph)
 *   - Enter after <br> (empty position) → new paragraph block
 *   - Enter in heading → new paragraph (standard Tiptap heading behavior)
 *   - Ctrl+B applies bold in this editor (confirmed working)
 *
 * Therefore, to ensure input rules (## / ### / > / -) fire correctly,
 * paragraph text uses Enter×2 to guarantee a fresh paragraph block for the next line.
 *
 * Unsupported: tables (skipped with warning), images.
 * Note: assumes editor is already focused (call after page.click('.ProseMirror')).
 */
async function applyMarkdownToEditor(page, markdownText) {
  const lines = markdownText.split('\n');
  let inList = false;
  let inQuote = false;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line === '```' || line.startsWith('```')) {
      // Code block toggle
      if (inCodeBlock) {
        // Closing ```: use Ctrl+Enter to exit code block (confirmed working in note.com)
        await page.keyboard.press('Control+Enter');
        await page.waitForTimeout(300);

        // Verify exit succeeded
        const exitedCodeBlock = await page.evaluate(() => {
          const sel = window.getSelection();
          if (!sel || !sel.anchorNode) return true;
          const el = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
          return !el.closest('pre, code');
        });

        if (!exitedCodeBlock) {
          // Fallback: Enter×3
          console.log('[code] Ctrl+Enter脱出失敗。Enter×3フォールバック');
          await page.keyboard.press('Enter');
          await page.keyboard.press('Enter');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(300);
        }
        inCodeBlock = false;
      } else {
        // Opening ```: exit any active block first
        if (inList) { await page.keyboard.press('Enter'); inList = false; }
        if (inQuote) { await page.keyboard.press('Enter'); inQuote = false; }
        // Type ``` to trigger ProseMirror code block input rule
        await page.keyboard.type('```');
        await page.waitForTimeout(500); // Wait for code block input rule to fire
        inCodeBlock = true;
      }

    } else if (inCodeBlock) {
      // Inside code block: use insertText (inserts \n as actual newline in code block)
      // Don't append \n on the last line before ``` to avoid extra blank line in code block
      const nextLine = lines[i + 1];
      const isLastCodeLine = (nextLine === '```' || (nextLine && nextLine.startsWith('```')));
      if (isLastCodeLine) {
        await page.keyboard.insertText(line);
      } else {
        await page.keyboard.insertText(line + '\n');
      }

    } else if (line.trim() === '---' || line.trim() === '***') {
      // Horizontal rule: skip (ProseMirror would convert to a black thick line)

    } else if (/^!\[.*?\]\((.+?)\)/.test(line.trim())) {
      // Markdown image reference: upload if local file exists, skip external URLs
      if (inList) { await page.keyboard.press('Enter'); inList = false; }
      if (inQuote) { await page.keyboard.press('Enter'); inQuote = false; }
      const imgMatch = line.trim().match(/^!\[.*?\]\((.+?)\)/);
      const imgPath = imgMatch ? imgMatch[1] : null;
      if (imgPath && !imgPath.startsWith('http')) {
        const path = require('path');
        const absPath = path.resolve(imgPath);
        if (fs.existsSync(absPath)) {
          console.log('[markdown] 画像を挿入:', absPath);
          // Move cursor to end of typed content, then upload via clipboard (no cursor displacement)
          await page.keyboard.press('Control+End');
          await page.waitForTimeout(200);
          await uploadImage(page, absPath, { skipClick: true });
          // After upload+save, re-focus editor (save button click steals focus)
          // then exit figcaption by pressing Enter (creates new paragraph after figure)
          await page.focus('.ProseMirror');
          await page.waitForTimeout(300);
          await page.keyboard.press('Control+End');  // move to end (figcaption of last image)
          await page.waitForTimeout(200);
          await page.keyboard.press('Enter');  // exit figcaption → new paragraph created
          await page.waitForTimeout(200);
        } else {
          console.log('[markdown] 画像ファイルなし（スキップ）:', imgPath);
        }
      } else {
        console.log('[markdown] 外部画像参照をスキップ:', line.trim());
      }

    } else if (/^https?:\/\/\S+$/.test(line.trim())) {
      // URL-only line → embed card (note auto-converts to OGP card)
      if (inList) { await page.keyboard.press('Enter'); inList = false; }
      if (inQuote) { await page.keyboard.press('Enter'); inQuote = false; }
      await page.keyboard.type(line.trim());
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000); // Wait for embed card conversion

    } else if (line.startsWith('## ')) {
      // H2 heading: input rule fires on "## " → Enter exits heading to new paragraph
      if (inList) { await page.keyboard.press('Enter'); inList = false; }
      if (inQuote) { await page.keyboard.press('Enter'); inQuote = false; }
      await page.keyboard.type('## ');
      await page.waitForTimeout(500); // Wait for ## input rule to fire
      // Verify heading was applied; if not, retry with a fresh paragraph block
      const isH2 = await page.evaluate(() => {
        const sel = window.getSelection();
        if (!sel || !sel.anchorNode) return false;
        const el = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
        return el.closest('h2') !== null;
      });
      if (!isH2) {
        console.log('[markdown] ## input rule未発火。段落を作り直してリトライ...');
        // Remove the "## " we just typed (3 chars)
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Backspace');
        // Ensure fresh empty paragraph block before retrying
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        await page.keyboard.type('## ');
        await page.waitForTimeout(500);
      }
      await applyInlineContent(page, line.slice(3));
      await page.keyboard.press('Enter');  // Heading Enter → new paragraph (not <br>)

    } else if (line.startsWith('### ')) {
      // H3 heading
      if (inList) { await page.keyboard.press('Enter'); inList = false; }
      if (inQuote) { await page.keyboard.press('Enter'); inQuote = false; }
      await page.keyboard.type('### ');
      await page.waitForTimeout(500); // Wait for ### input rule to fire
      // Verify heading was applied; if not, retry with a fresh paragraph block
      const isH3 = await page.evaluate(() => {
        const sel = window.getSelection();
        if (!sel || !sel.anchorNode) return false;
        const el = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
        return el.closest('h3') !== null;
      });
      if (!isH3) {
        console.log('[markdown] ### input rule未発火。段落を作り直してリトライ...');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        await page.keyboard.type('### ');
        await page.waitForTimeout(500);
      }
      await applyInlineContent(page, line.slice(4));
      await page.keyboard.press('Enter');  // Heading Enter → new paragraph

    } else if (line.startsWith('> ')) {
      // Blockquote: input rule fires on "> " at start of paragraph
      if (inList) { await page.keyboard.press('Enter'); inList = false; }
      if (!inQuote) {
        await page.keyboard.type('> ');
        await page.waitForTimeout(100);
        inQuote = true;
      }
      await applyInlineContent(page, line.slice(2));
      const nextLine = lines[i + 1];
      if (!nextLine || !nextLine.startsWith('> ')) {
        // Exit blockquote: Enter creates new line in blockquote, second Enter exits it
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        inQuote = false;
      } else {
        await page.keyboard.press('Enter');
      }

    } else if (line.startsWith('- ')) {
      // Bullet list
      if (inQuote) { await page.keyboard.press('Enter'); inQuote = false; }
      if (!inList) {
        // First list item: `- ` triggers input rule → bullet list
        await page.keyboard.type('- ');
        await page.waitForTimeout(300);
        inList = true;
      } else {
        // 2nd+ item: Enter was pressed, but check DOM to ensure we're still in a list item
        // (bold input rule can cause list context to be lost)
        const stillInList = await page.evaluate(() => {
          const sel = window.getSelection();
          if (!sel || !sel.anchorNode) return false;
          const el = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
          return !!el.closest('li');
        });
        if (!stillInList) {
          console.log('[list] list context lost. Re-entering with "- "');
          await page.keyboard.type('- ');
          await page.waitForTimeout(300);
        }
      }
      await applyInlineContent(page, line.slice(2));
      const nextLine = lines[i + 1];
      if (!nextLine || !nextLine.startsWith('- ')) {
        // Last list item: Enter twice exits list to new paragraph
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        inList = false;
      } else {
        await page.keyboard.press('Enter');
      }

    } else if (line.startsWith('| ') || line.startsWith('|---')) {
      // Table — not supported by note.com editor; emit warning and skip
      console.warn('[markdown] テーブル記法はnote非対応のためスキップします:', line);

    } else if (line.trim() !== '') {
      // Plain paragraph text (may contain inline bold/links)
      if (inList) { await page.keyboard.press('Enter'); inList = false; }
      if (inQuote) { await page.keyboard.press('Enter'); inQuote = false; }
      await applyInlineContent(page, line);
      // Enter count depends on what follows:
      // - No more content: no Enter (avoid auto-conversion side effects)
      // - Next is blank line (Markdown paragraph separator):
      //   - If followed by input rule trigger (##, ###, >, -, ```, URL, ![]): Enter×2 (new paragraph block required)
      //   - Otherwise: Enter×1 (<br> only, matches how humans type in note.com)
      // - Next is input rule trigger (##, ###, >, -, ```, URL, ![]): Enter×2 → fresh paragraph block needed
      // - Next is non-empty text: Enter×1 (<br>, same paragraph continuation)
      const nextLine = lines[i + 1];
      const nextNonEmpty = lines.slice(i + 1).find(l => l.trim() !== '');
      if (!nextNonEmpty) {
        // Last content line: no Enter
      } else if (!nextLine || nextLine.trim() === '') {
        // Next is blank line (Markdown paragraph separator)
        // Check what comes AFTER the blank line(s)
        if (nextNonEmpty && /^(#{2,3} |> |- |```|https?:\/\/|!\[)/.test(nextNonEmpty)) {
          // Input rule line after blank: Enter×2 (new paragraph block required)
          await page.keyboard.press('Enter');
          await page.keyboard.press('Enter');
        } else {
          // Regular text paragraph after blank: Enter×1 (<br> only)
          // This matches how humans type in note.com — single Enter between paragraphs
          await page.keyboard.press('Enter');
        }
      } else if (/^(#{2,3} |> |- |```|https?:\/\/|!\[)/.test(nextLine)) {
        // Input rule line follows directly (no blank line): Enter×2
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
      } else {
        // Same paragraph continuation (no blank line): Enter×1 (<br>)
        await page.keyboard.press('Enter');
      }

    }
    // Empty lines: skipped (Enter×2 after paragraph text provides sufficient block separation)
  }
}

/**
 * uploadImage(page, imagePath)
 * Upload an image file to the note editor via the toolbar image button.
 * Uses the file chooser API (Playwright) to set the file via the toolbar's image insert button.
 *
 * Flow:
 *   1. Click toolbar button[aria-label="画像を追加"] → triggers file chooser dialog
 *   2. Set image file via fileChooser.setFiles()
 *   3. Wait for upload completion (image appears in editor)
 *
 * Falls back to direct input[type="file"] injection if file chooser event is not triggered.
 */
async function uploadImage(page, imagePath, options = {}) {
  const path = require('path');
  const absPath = path.resolve(imagePath);

  if (!fs.existsSync(absPath)) {
    console.error(`[image] ファイルが見つかりません: ${absPath}`);
    return;
  }

  console.log('[image] 画像アップロード開始:', absPath);

  // Ensure we are on the editor page
  if (!page.url().includes('editor.note.com')) {
    console.log('[image] エディタページではありません。スキップします。URL:', page.url());
    return;
  }

  if (!options.skipClick) {
    // Click ProseMirror to ensure focus (cursor must be in editor for image insertion)
    await page.click('.ProseMirror');
    await page.waitForTimeout(500);
  }

  if (options.skipClick) {
    // Inline mode: skip Strategies 1+2 (they don't work mid-typing), go directly to clipboard paste
  } else {
  // Strategy 1: Wait for file chooser before clicking the toolbar image button
  try {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 8000 }),
      page.click('button[aria-label="画像を追加"]'),
    ]);
    await fileChooser.setFiles(absPath);
    console.log('[image] ファイル選択完了 (filechooser)');
    // Strategy 1 success — skip clipboard fallback
    await page.waitForSelector('.ProseMirror img, .ProseMirror figure', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const saveBtn1 = await page.$('button:has-text("下書き保存")');
    if (saveBtn1) { await saveBtn1.click({ force: true }); await page.waitForTimeout(2000); console.log('[image] 画像挿入後の下書き保存完了'); }
    return;
  } catch (err) {
    console.log('[image] filechooserイベントが取得できませんでした。直接input[type="file"]を試みます:', err.message);

    // Strategy 2: direct input[type="file"] injection
    try {
      await page.click('button[aria-label="画像を追加"]');
      await page.waitForTimeout(1000);
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(absPath);
        console.log('[image] ファイル選択完了 (direct input)');
      } else {
        console.log('[image] input[type="file"]が見つかりませんでした。クリップボード貼り付けを試みます。');
      }
    } catch (err2) {
      console.log('[image] Strategy2失敗。クリップボード貼り付けを試みます:', err2.message);
    }
  }
  } // end if (!options.skipClick)

    // Strategy 3: Clipboard paste (fallback)
    try {
      console.log('[image] クリップボード貼り付けを試みます...');
      const context = page.context();
      await context.grantPermissions(['clipboard-write', 'clipboard-read']);
      const imgBase64 = fs.readFileSync(absPath).toString('base64');
      const mimeType = absPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
      await page.evaluate(async ([b64, mime]) => {
        const res = await fetch(`data:${mime};base64,${b64}`);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
      }, [imgBase64, mimeType]);
      if (!options.skipClick) {
        // Standalone upload: click ProseMirror and move to end
        await page.click('.ProseMirror');
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
      }
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(2000);
      console.log('[image] クリップボード貼り付け完了');
    } catch (err3) {
      console.log('[image] クリップボード貼り付け失敗:', err3.message);
      console.log('[image] 画像アップロード自動化断念。手動挿入が必要です。');
      return;
    }

  // Wait for upload to complete (image should appear in editor as <img> or figure)
  try {
    await page.waitForSelector('.ProseMirror img, .ProseMirror figure', { timeout: 15000 });
    console.log('[image] 画像アップロード完了');
  } catch (_) {
    console.log('[image] 画像挿入の確認がタイムアウト。アップロードは試みましたが確認できませんでした。');
  }

  // Save draft after image upload
  await page.waitForTimeout(1000);
  const saveBtn = await page.$('button:has-text("下書き保存")');
  if (saveBtn) {
    await saveBtn.click({ force: true });
    await page.waitForTimeout(2000);
    console.log('[image] 画像挿入後の下書き保存完了');
  }
}

/**
 * setCoverImage(page, imagePath)
 * Set cover (header) image for the note article.
 * Clicks the cover image button in the editor header, then uploads the image file.
 */
async function setCoverImage(page, imagePath) {
  const path = require('path');
  const absPath = path.resolve(imagePath);

  if (!fs.existsSync(absPath)) {
    console.error(`[cover] ファイルが見つかりません: ${absPath}`);
    return false;
  }

  console.log('[cover] カバー画像設定開始:', absPath);

  // ページトップへスクロール（カバー画像ボタンが表示エリアに入るように）
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);

  // 既存のカバー画像がある場合は削除ボタン（aria-label="削除"）をクリック
  const existingCover = await page.$('div[data-dragging] button[aria-label="削除"]');
  if (existingCover) {
    const bbox = await existingCover.boundingBox();
    if (bbox && bbox.y < 500) {
      console.log('[cover] 既存カバー画像を削除します');
      await existingCover.click();
      await page.waitForTimeout(1500);
    }
  }

  // エディタ上部のカバー画像設定エリアをクリック
  // ページ上部(y<200)にある「画像を追加」ボタンがカバー画像ボタン
  await page.waitForSelector('button[aria-label="画像を追加"]', { timeout: 10000 });
  const allImageBtns = await page.$$('button[aria-label="画像を追加"]');
  let coverBtn = null;
  for (const btn of allImageBtns) {
    const bbox = await btn.boundingBox();
    console.log('[cover] 画像追加ボタン位置: y=' + (bbox ? Math.round(bbox.y) : 'null'));
    if (bbox && bbox.y < 200) {
      coverBtn = btn;
      break;
    }
  }
  if (!coverBtn) {
    console.log('[cover] WARNING: カバー画像ボタンが見つかりません。セレクタを確認してください。');
    return false;
  }
  console.log('[cover] カバー画像ボタン発見。クリックします。');

  // ファイルチューザーが直接開く場合とサブメニューが出る場合の両方に対応
  let fileChooser;
  try {
    [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 3000 }),
      coverBtn.click(),
    ]);
  } catch (_) {
    // サブメニューが出た場合：アップロードオプションを探す（サブメニュー描画待ち）
    await page.waitForTimeout(1000);
    const uploadOption = await page.$('button:has-text("画像をアップロード")') ||
                         await page.$('button:has-text("アップロード")');
    if (!uploadOption) {
      console.log('[cover] WARNING: アップロードオプションが見つかりません');
      return false;
    }
    [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }),
      uploadOption.click(),
    ]);
  }
  await fileChooser.setFiles(absPath);

  // CropModalが表示されるのを待つ
  let cropModalVisible = false;
  try {
    await page.waitForSelector('.CropModal__content', { timeout: 8000 });
    cropModalVisible = true;
    console.log('[cover] CropModal表示確認');
  } catch (_) {
    console.log('[cover] NOTE: CropModal未表示。直接保存します。');
  }

  let clicked = false;

  if (cropModalVisible) {
    // [FIX-B] waitForResponseをクリック前に設定（レースコンディション修正）
    const responsePromise = page.waitForResponse(
      res => res.url().includes('note_eyecatch') && res.status() < 400,
      { timeout: 30000 }
    ).catch(() => null);

    // モーダル描画完了待ち
    await page.waitForTimeout(1000);

    // [DEBUG] CropModal内の全ボタン情報をログ出力
    const debugInfo = await page.evaluate(() => {
      const modal = document.querySelector('.CropModal__content');
      if (!modal) return 'NO_MODAL';
      return Array.from(modal.querySelectorAll('button')).map(b => ({
        text: b.textContent.trim(),
        cls: b.className,
        disabled: b.disabled,
        rect: { x: Math.round(b.getBoundingClientRect().x), y: Math.round(b.getBoundingClientRect().y), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }
      }));
    });
    console.log('[cover] CropModal buttons debug:', JSON.stringify(debugInfo));

    // [FIX-A] Playwrightネイティブclick（isTrusted:true）で保存ボタンをクリック
    const modal = page.locator('.CropModal__content');
    const buttons = modal.locator('button');
    const count = await buttons.count();

    const saveTexts = ['保存', 'OK', '適用', '完了', '設定する', '決定', '確定'];

    // 1. テキスト完全一致
    for (let i = 0; i < count && !clicked; i++) {
      const text = ((await buttons.nth(i).textContent()) || '').trim();
      if (saveTexts.includes(text)) {
        console.log('[cover] Save button found by text match:', text);
        await buttons.nth(i).click();
        clicked = true;
      }
    }

    // 2. キャンセルでない最後のボタン（Playwrightネイティブclick）
    if (!clicked) {
      for (let i = count - 1; i >= 0; i--) {
        const text = ((await buttons.nth(i).textContent()) || '').trim();
        if (text !== 'キャンセル' && text !== 'Cancel') {
          console.log('[cover] Save button found by fallback (non-cancel last):', text || '(no text)');
          await buttons.nth(i).click();
          clicked = true;
          break;
        }
      }
    }

    if (clicked) {
      const response = await responsePromise;
      if (response) {
        console.log('[cover] カバー画像アップロード完了（API応答確認）');
      } else {
        console.log('[cover] WARNING: アップロードレスポンス待機タイムアウト（30秒）');
      }
    } else {
      console.log('[cover] CRITICAL: CropModal内の保存ボタンが見つかりませんでした');
    }

    // CropModalが閉じるのを待つ
    try {
      await page.waitForSelector('.CropModal__content', { state: 'hidden', timeout: 15000 });
      console.log('[cover] CropModal閉じ確認');
    } catch (_) {
      console.log('[cover] WARNING: CropModalが閉じませんでした。保存ボタンのクリックが無効だった可能性あり。');
      await page.waitForTimeout(3000);
    }
  }

  console.log('[cover] カバー画像を設定しました:', absPath);

  // [FIX-C] 下書き保存もPlaywrightネイティブclick
  const draftBtn = page.locator('button:has-text("下書き保存")').first();
  let draftSaved = false;
  try {
    await draftBtn.click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    console.log('[cover] 下書き保存完了');
    draftSaved = true;
  } catch (_) {
    // フォールバック: Ctrl+S
    await page.keyboard.press('Control+S');
    await page.waitForTimeout(2000);
    console.log('[cover] Ctrl+Sで保存試行');
    draftSaved = true;
  }

  // [FIX-D] 成功判定を厳密化
  if (clicked && draftSaved) {
    console.log('[cover] カバー画像設定+保存完了:', absPath);
    return true;
  } else {
    console.log('[cover] WARNING: カバー画像設定に問題あり。clicked=' + clicked + ', draftSaved=' + draftSaved);
    return false;
  }
}

main().catch(err => {
  console.error('[error]', err.message);
  process.exit(1);
});
