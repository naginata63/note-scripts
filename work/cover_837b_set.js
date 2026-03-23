/**
 * cover_837b_set.js
 * cmd_837修正: カバー画像設定スクリプト
 * note記事 n7a0a5b5fb294 に cover_837b.png をセット
 * publishは絶対禁止
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const USER_DATA_DIR = '/home/murakami/.cache/ms-playwright/note-cli-profile';
const NOTE_URL = 'https://editor.note.com/notes/n7a0a5b5fb294/edit/';
const IMAGE_PATH = path.resolve(__dirname, 'cover_837b.png');

(async () => {
  if (!fs.existsSync(IMAGE_PATH)) {
    console.error('ERROR: 画像ファイルが見つかりません:', IMAGE_PATH);
    process.exit(1);
  }

  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 }
  });
  const page = await ctx.newPage();

  console.log('[cover] エディタを開きます:', NOTE_URL);
  await page.goto(NOTE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  // Scroll to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);

  // Screenshot: before
  await page.screenshot({ path: '/tmp/cover837b_before.png' });
  console.log('[cover] Before screenshot: /tmp/cover837b_before.png');

  // Inspect all buttons to find cover button
  const allBtns = await page.$$('button');
  console.log('[cover] ボタン総数:', allBtns.length);
  for (const btn of allBtns) {
    const ariaLabel = await btn.getAttribute('aria-label');
    const bbox = await btn.boundingBox();
    const text = await btn.textContent().catch(() => '');
    if (bbox && bbox.y < 300) {
      console.log(`[cover] button aria="${ariaLabel}" text="${text.trim().substring(0, 30)}" y=${Math.round(bbox.y)}`);
    }
  }

  // Try multiple selectors for cover button
  const coverSelectors = [
    'button[aria-label="画像を追加"]',
    'button[aria-label="カバー画像を追加"]',
    'button[aria-label="アイキャッチ"]',
    'button[aria-label="Cover image"]',
    '[class*="eyecatch"] button',
    '[class*="cover"] button',
    '[class*="Cover"] button',
    '[class*="header"] button[type="button"]',
  ];

  let coverBtn = null;
  for (const sel of coverSelectors) {
    try {
      const btns = await page.$$(sel);
      for (const btn of btns) {
        const bbox = await btn.boundingBox();
        if (bbox && bbox.y < 300) {
          console.log(`[cover] セレクタ一致: ${sel} y=${Math.round(bbox.y)}`);
          coverBtn = btn;
          break;
        }
      }
      if (coverBtn) break;
    } catch (e) {
      // ignore
    }
  }

  if (!coverBtn) {
    // Try to find any button in the top 300px
    console.log('[cover] 既知セレクタで見つからず。y<300の全ボタンを試みます...');
    for (const btn of allBtns) {
      const bbox = await btn.boundingBox();
      if (bbox && bbox.y < 300) {
        const ariaLabel = await btn.getAttribute('aria-label');
        // Skip clearly non-cover buttons
        if (ariaLabel && (ariaLabel.includes('画像') || ariaLabel.includes('カバー') || ariaLabel.includes('アイキャッチ') || ariaLabel.includes('image') || ariaLabel.includes('cover'))) {
          coverBtn = btn;
          console.log(`[cover] フォールバック選択: aria="${ariaLabel}" y=${Math.round(bbox.y)}`);
          break;
        }
      }
    }
  }

  if (!coverBtn) {
    console.error('[cover] ERROR: カバー画像ボタンが見つかりません');
    await page.screenshot({ path: '/tmp/cover837b_error.png' });
    console.log('[cover] Error screenshot: /tmp/cover837b_error.png');
    await ctx.close();
    process.exit(1);
  }

  console.log('[cover] カバー画像ボタン発見。クリックします...');
  let fileChooser;
  try {
    [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }),
      coverBtn.click(),
    ]);
    console.log('[cover] FileChooser直接取得成功');
  } catch (_) {
    console.log('[cover] FileChooser直接取得失敗 - サブメニュー確認');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/cover837b_submenu.png' });
    console.log('[cover] Submenu screenshot: /tmp/cover837b_submenu.png');

    const uploadOption = await page.$('button:has-text("画像をアップロード")') ||
                         await page.$('button:has-text("アップロード")') ||
                         await page.$('button:has-text("upload")');
    if (!uploadOption) {
      console.error('[cover] ERROR: アップロードオプションが見つかりません');
      await ctx.close();
      process.exit(1);
    }
    [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }),
      uploadOption.click(),
    ]);
    console.log('[cover] FileChooserをサブメニュー経由で取得');
  }

  await fileChooser.setFiles(IMAGE_PATH);
  console.log('[cover] ファイル設定完了:', IMAGE_PATH);
  await page.waitForTimeout(3000);

  // Check for CropModal
  const cropModal = await page.$('.CropModal__content');
  if (cropModal) {
    console.log('[cover] CropModal表示');
    await page.screenshot({ path: '/tmp/cover837b_cropmodal.png' });

    const okClicked = await page.evaluate(() => {
      const modal = document.querySelector('.CropModal__content');
      if (!modal) return null;
      for (const btn of modal.querySelectorAll('button')) {
        const text = btn.textContent.trim();
        if (['保存', 'OK', '適用', '完了', '設定する'].includes(text)) {
          btn.click();
          return text;
        }
      }
      const texts = Array.from(modal.querySelectorAll('button')).map(b => b.textContent.trim());
      return 'NOT_FOUND: ' + texts.join(', ');
    });
    console.log('[cover] CropModal保存クリック結果:', okClicked);
    await page.waitForTimeout(8000);
  } else {
    console.log('[cover] CropModal未表示');
  }

  // Save draft
  const draftSaved = await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.textContent.trim() === '下書き保存') {
        btn.click();
        return true;
      }
    }
    return false;
  });
  console.log('[cover] 下書き保存:', draftSaved);
  await page.waitForTimeout(3000);

  // Final screenshot
  await page.screenshot({ path: '/tmp/cover837b_final.png' });
  console.log('[cover] Final screenshot: /tmp/cover837b_final.png');

  console.log('[cover] 完了');
  await ctx.close();
})();
