/**
 * cover_837b_replace.js
 * cmd_837修正: カバー画像置き換えスクリプト
 * 既存カバー画像(2ヶ月版)をhover→削除→新画像(2週間版)アップロード
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

  // Find the existing cover image
  // In note.com editor, cover image is in eyecatch area (above ProseMirror)
  const coverImg = await page.$('[class*="eyecatch"] img, [class*="Eyecatch"] img, [class*="cover"] img, [class*="Cover"] img');
  if (coverImg) {
    console.log('[cover] 既存カバー画像検出');
    // Hover over the image to reveal buttons
    await coverImg.hover();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/cover837b_hover.png' });
    console.log('[cover] Hover screenshot: /tmp/cover837b_hover.png');
  } else {
    console.log('[cover] eyecatchセレクタで画像見つからず。DOM検査を実施...');
  }

  // Check DOM structure near the top
  const domInfo = await page.evaluate(() => {
    const topElements = [];
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
      const rect = el.getBoundingClientRect();
      if (rect.y < 250 && rect.y > -10 && rect.height > 10 && rect.width > 100) {
        topElements.push({
          tag: el.tagName,
          cls: el.className.substring(0, 80),
          aria: el.getAttribute('aria-label'),
          y: Math.round(rect.y),
          h: Math.round(rect.height),
          text: el.textContent.trim().substring(0, 30)
        });
      }
    }
    return topElements.slice(0, 30);
  });
  console.log('[cover] トップエリア DOM:');
  for (const el of domInfo) {
    if (el.tag === 'BUTTON' || el.tag === 'IMG' || el.cls.includes('eye') || el.cls.includes('cover') || el.cls.includes('Cover')) {
      console.log(`  ${el.tag} cls="${el.cls}" aria="${el.aria}" y=${el.y} text="${el.text}"`);
    }
  }

  // Try to hover over the image area at the top of the page
  // The image appears to be at approximately y=40-230 based on screenshot
  await page.mouse.move(640, 120);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/cover837b_hover2.png' });
  console.log('[cover] Hover2 screenshot: /tmp/cover837b_hover2.png');

  // Check for delete/change buttons that appear after hover
  const postHoverBtns = await page.$$('button');
  console.log('[cover] Hover後ボタン:');
  for (const btn of postHoverBtns) {
    const bbox = await btn.boundingBox();
    const ariaLabel = await btn.getAttribute('aria-label');
    const text = await btn.textContent().catch(() => '');
    if (bbox && bbox.y < 300 && bbox.y > 0) {
      console.log(`  aria="${ariaLabel}" text="${text.trim().substring(0, 30)}" y=${Math.round(bbox.y)}`);
    }
  }

  // Try to find a delete or replace button near the image
  const deleteBtn = await page.$('button[aria-label="削除"]') ||
                    await page.$('button[aria-label="画像を削除"]') ||
                    await page.$('button[aria-label="remove"]') ||
                    await page.$('button:has-text("削除")');

  if (deleteBtn) {
    const bbox = await deleteBtn.boundingBox();
    if (bbox && bbox.y < 300) {
      console.log('[cover] 削除ボタン発見 y=' + Math.round(bbox.y));
      await deleteBtn.click();
      await page.waitForTimeout(2000);
      console.log('[cover] 削除完了');
    }
  } else {
    console.log('[cover] 削除ボタン未発見。変更ボタンを探します...');
    // Try "変更" button
    const changeBtn = await page.$('button[aria-label="変更"]') ||
                      await page.$('button:has-text("変更")') ||
                      await page.$('button[aria-label="画像を変更"]');
    if (changeBtn) {
      const bbox = await changeBtn.boundingBox();
      console.log('[cover] 変更ボタン発見 y=' + (bbox ? Math.round(bbox.y) : 'null'));
    }
  }

  // After potential deletion, look for the add cover image button
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);

  const addBtn = await page.$('button[aria-label="画像を追加"]') ||
                 await page.$('button[aria-label="カバー画像を追加"]');

  if (addBtn) {
    console.log('[cover] 追加ボタン発見');
    let fileChooser;
    try {
      [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }),
        addBtn.click(),
      ]);
    } catch (_) {
      await page.waitForTimeout(1000);
      const uploadOpt = await page.$('button:has-text("画像をアップロード")') ||
                        await page.$('button:has-text("アップロード")');
      if (uploadOpt) {
        [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 5000 }),
          uploadOpt.click(),
        ]);
      }
    }
    if (fileChooser) {
      await fileChooser.setFiles(IMAGE_PATH);
      console.log('[cover] 新画像設定完了');
      await page.waitForTimeout(3000);

      // Handle CropModal
      const cropModal = await page.$('.CropModal__content');
      if (cropModal) {
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
          return 'NOT_FOUND: ' + Array.from(modal.querySelectorAll('button')).map(b => b.textContent.trim()).join(', ');
        });
        console.log('[cover] CropModal保存:', okClicked);
        await page.waitForTimeout(8000);
      }
    }
  } else {
    console.log('[cover] 追加ボタン未発見。最終的なDOM状態を確認します...');
    const finalBtns = await page.$$('button');
    for (const btn of finalBtns) {
      const bbox = await btn.boundingBox();
      const aria = await btn.getAttribute('aria-label');
      if (bbox && bbox.y < 400 && bbox.y > 0) {
        const text = await btn.textContent().catch(() => '');
        console.log(`  button aria="${aria}" text="${text.trim().substring(0, 40)}" y=${Math.round(bbox.y)}`);
      }
    }
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
  await page.screenshot({ path: '/tmp/cover837b_final.png', fullPage: false });
  console.log('[cover] Final screenshot: /tmp/cover837b_final.png');

  await ctx.close();
  console.log('[cover] 完了');
})();
