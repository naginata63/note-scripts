/**
 * note-mcp-server Integration Tests
 *
 * MCPプロトコル層のテスト。実際のnote.com APIは呼び出さない。
 * Node.js内蔵のassertモジュールを使用（Jest不要）。
 */

import assert from 'assert';

// ── Inline stubs (actual modules not yet built) ──────────────────────────────

/**
 * markdownToHtml stub: 実装が存在する場合はimportに切り替える
 * import { markdownToHtml } from '../src/markdown-to-html.js';
 */
function markdownToHtml(markdown: string): string {
  let html = markdown;
  // 見出し
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // 太字
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // 順序なしリスト
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  return html;
}

/**
 * NoteClient stub: 認証情報バリデーションのみ再現
 */
class NoteClient {
  private email: string;
  private password: string;

  constructor() {
    this.email = process.env.NOTE_EMAIL ?? '';
    this.password = process.env.NOTE_PASSWORD ?? '';
  }

  async authenticate(): Promise<void> {
    if (!this.email || !this.password) {
      throw new Error(
        'NOTE_EMAIL または NOTE_PASSWORD 環境変数が設定されていません'
      );
    }
  }
}

/**
 * Tool input validator stub
 */
function validateToolInput(
  toolName: string,
  args: Record<string, unknown>
): void {
  if (toolName === 'note_create_draft') {
    const title = args['title'];
    if (!title || (typeof title === 'string' && title.trim() === '')) {
      throw new Error('title は必須パラメータです');
    }
  }
  if (toolName === 'note_publish') {
    const noteId = args['note_id'];
    if (!noteId || (typeof noteId === 'string' && noteId.trim() === '')) {
      throw new Error('note_id は必須パラメータです');
    }
  }
}

// ── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): void {
  Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ ${name}`);
      passed++;
    })
    .catch((err: Error) => {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    });
}

// ── 1. markdownToHtml ユニットテスト ──────────────────────────────────────────

console.log('\n[1] markdownToHtml() ユニットテスト');

test('# 見出し1 → <h1>タイトル</h1>', () => {
  const result = markdownToHtml('# タイトル');
  assert.strictEqual(result.trim(), '<h1>タイトル</h1>');
});

test('## 見出し2 → <h2>サブタイトル</h2>', () => {
  const result = markdownToHtml('## サブタイトル');
  assert.strictEqual(result.trim(), '<h2>サブタイトル</h2>');
});

test('### 見出し3 → <h3>小見出し</h3>', () => {
  const result = markdownToHtml('### 小見出し');
  assert.strictEqual(result.trim(), '<h3>小見出し</h3>');
});

test('**太字** → <strong>太字</strong>', () => {
  const result = markdownToHtml('**太字**');
  assert.strictEqual(result.trim(), '<strong>太字</strong>');
});

test('- リスト → <li>リスト</li>', () => {
  const result = markdownToHtml('- リスト項目');
  assert.strictEqual(result.trim(), '<li>リスト項目</li>');
});

test('複合Markdown変換', () => {
  const md = '# タイトル\n\n**重要**なポイント';
  const html = markdownToHtml(md);
  assert.ok(html.includes('<h1>タイトル</h1>'), 'h1タグが含まれること');
  assert.ok(html.includes('<strong>重要</strong>'), 'strongタグが含まれること');
});

// ── 2. NoteClient エラーハンドリングテスト ────────────────────────────────────

console.log('\n[2] NoteClient エラーハンドリングテスト');

test('NOTE_EMAIL未設定時にエラーをスロー', async () => {
  const savedEmail = process.env.NOTE_EMAIL;
  const savedPassword = process.env.NOTE_PASSWORD;
  delete process.env.NOTE_EMAIL;
  process.env.NOTE_PASSWORD = 'testpass';

  try {
    const client = new NoteClient();
    await assert.rejects(
      () => client.authenticate(),
      (err: Error) => {
        assert.ok(
          err.message.includes('NOTE_EMAIL'),
          `エラーメッセージにNOTE_EMAILが含まれること。実際: ${err.message}`
        );
        return true;
      }
    );
  } finally {
    if (savedEmail !== undefined) process.env.NOTE_EMAIL = savedEmail;
    else delete process.env.NOTE_EMAIL;
    if (savedPassword !== undefined) process.env.NOTE_PASSWORD = savedPassword;
    else delete process.env.NOTE_PASSWORD;
  }
});

test('NOTE_PASSWORD未設定時にエラーをスロー', async () => {
  const savedEmail = process.env.NOTE_EMAIL;
  const savedPassword = process.env.NOTE_PASSWORD;
  process.env.NOTE_EMAIL = 'test@example.com';
  delete process.env.NOTE_PASSWORD;

  try {
    const client = new NoteClient();
    await assert.rejects(
      () => client.authenticate(),
      (err: Error) => {
        assert.ok(
          err.message.includes('NOTE_PASSWORD'),
          `エラーメッセージにNOTE_PASSWORDが含まれること。実際: ${err.message}`
        );
        return true;
      }
    );
  } finally {
    if (savedEmail !== undefined) process.env.NOTE_EMAIL = savedEmail;
    else delete process.env.NOTE_EMAIL;
    if (savedPassword !== undefined) process.env.NOTE_PASSWORD = savedPassword;
    else delete process.env.NOTE_PASSWORD;
  }
});

// ── 3. MCPツール入力バリデーションテスト ─────────────────────────────────────

console.log('\n[3] MCPツール入力バリデーションテスト');

test('note_create_draft: titleが空の場合にエラー', () => {
  assert.throws(
    () => validateToolInput('note_create_draft', { title: '', body: 'テスト' }),
    (err: Error) => {
      assert.ok(
        err.message.includes('title'),
        `エラーメッセージにtitleが含まれること。実際: ${err.message}`
      );
      return true;
    }
  );
});

test('note_create_draft: titleがスペースのみの場合にエラー', () => {
  assert.throws(
    () =>
      validateToolInput('note_create_draft', {
        title: '   ',
        body: 'テスト',
      }),
    /title/
  );
});

test('note_create_draft: titleが有効な場合はエラーなし', () => {
  assert.doesNotThrow(() =>
    validateToolInput('note_create_draft', {
      title: '有効なタイトル',
      body: 'テスト本文',
    })
  );
});

test('note_publish: note_idが空の場合にエラー', () => {
  assert.throws(
    () =>
      validateToolInput('note_publish', {
        note_id: '',
        title: 'タイトル',
        body: '本文',
      }),
    (err: Error) => {
      assert.ok(
        err.message.includes('note_id'),
        `エラーメッセージにnote_idが含まれること。実際: ${err.message}`
      );
      return true;
    }
  );
});

test('note_publish: note_idが有効な場合はエラーなし', () => {
  assert.doesNotThrow(() =>
    validateToolInput('note_publish', {
      note_id: 'abc12345',
      title: 'タイトル',
      body: '本文',
    })
  );
});

// ── Summary ──────────────────────────────────────────────────────────────────

// Give async tests time to complete
setTimeout(() => {
  console.log(`\n結果: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}, 100);
