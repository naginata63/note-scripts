/**
 * cover_837b_upload.js
 * sc-131cded0-4 gZxwHj ボタンを直接クリックしてカバー画像をアップロード
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

  console.log('エディタを開きます...');
  await page.goto(NOTE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // Find the cover area button
  const btnInfo = await page.evaluate(() => {
    // Find button inside sc-131cded0-0 doUWus
    const container = document.querySelector('.sc-131cded0-0.doUWus, [class*="sc-131cded0-0"]');
    if (!container) {
      // Try finding by structure: div containing FIGURE + BUTTON
      const figures = document.querySelectorAll('figure.relative');
      for (const fig of figures) {
        const parent = fig.parentElement;
        if (parent) {
          const btns = parent.querySelectorAll('button');
          if (btns.length > 0) {
            const rect = btns[0].getBoundingClientRect();
            return {
              found: true,
              method: 'figure_sibling',
              y: Math.round(rect.y),
              x: Math.round(rect.x),
              cls: btns[0].className,
              aria: btns[0].getAttribute('aria-label'),
              text: btns[0].textContent.trim()
            };
          }
        }
      }
      return { found: false, method: 'none' };
    }
    const btn = container.querySelector('button');
    if (!btn) return { found: false, method: 'no_btn_in_container' };
    const rect = btn.getBoundingClientRect();
    return {
      found: true,
      method: 'container_btn',
      y: Math.round(rect.y),
      x: Math.round(rect.x),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      cls: btn.className,
      aria: btn.getAttribute('aria-label'),
      text: btn.textContent.trim().substring(0, 40),
      visible: rect.height > 0
    };
  });
  console.log('カバーボタン情報:', JSON.stringify(btnInfo));

  // Try clicking the button
  const coverAreaBtn = await page.$('.sc-131cded0-0 button, .doUWus button');
  if (coverAreaBtn) {
    const bbox = await coverAreaBtn.boundingBox();
    const text = await coverAreaBtn.textContent();
    const aria = await coverAreaBtn.getAttribute('aria-label');
    console.log(`カバーエリアボタン発見: y=${bbox ? Math.round(bbox.y) : 'null'} aria="${aria}" text="${text.trim().substring(0, 40)}"`);

    try {
      console.log('FileChooserを待機してボタンクリック...');
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 8000 }),
        coverAreaBtn.click(),
      ]);
      console.log('FileChooser取得成功！');
      await fileChooser.setFiles(IMAGE_PATH);
      console.log('ファイル設定完了');
      await page.waitForTimeout(3000);
      await page.screenshot({ path: '/tmp/cover837b_after_upload.png' });
      console.log('Upload screenshot: /tmp/cover837b_after_upload.png');

      // Handle CropModal
      const cropModal = await page.$('.CropModal__content');
      if (cropModal) {
        console.log('CropModal表示');
        await page.screenshot({ path: '/tmp/cover837b_cropmodal.png' });
        const okClicked = await page.evaluate(() => {
          const modal = document.querySelector('.CropModal__content');
          if (!modal) return null;
          for (const btn of modal.querySelectorAll('button')) {
            const text = btn.textContent.trim();
            if (['保存', 'OK', '適用', '完了', '設定する', 'クロップして保存', 'トリミングして保存'].includes(text)) {
              btn.click();
              return text;
            }
          }
          return 'NOT_FOUND: ' + Array.from(modal.querySelectorAll('button')).map(b => b.textContent.trim()).join(', ');
        });
        console.log('CropModal保存:', okClicked);
        await page.waitForTimeout(8000);
        await page.screenshot({ path: '/tmp/cover837b_after_crop.png' });
        console.log('After crop screenshot: /tmp/cover837b_after_crop.png');
      } else {
        console.log('CropModal未表示');
      }
    } catch (e) {
      console.log('FileChooser失敗:', e.message);
      // Check what happened after click
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/cover837b_after_click.png' });
      console.log('After click screenshot: /tmp/cover837b_after_click.png');

      // Check for submenu/dialog
      const dialogs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[role="dialog"], [role="menu"], [class*="Dialog"], [class*="Modal"], [class*="Popup"]'))
          .filter(el => el.getBoundingClientRect().height > 0)
          .map(el => ({
            cls: el.className.substring(0, 80),
            role: el.getAttribute('role'),
            text: el.textContent.trim().substring(0, 100)
          }));
      });
      console.log('Dialog/Modalリスト:', JSON.stringify(dialogs));
    }
  } else {
    console.log('カバーエリアボタン未発見。代替セレクタを試みます...');

    // Take screenshot to see current state
    await page.screenshot({ path: '/tmp/cover837b_no_btn.png' });
    console.log('No button screenshot: /tmp/cover837b_no_btn.png');

    // List ALL buttons with their positions
    const allBtnData = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map(btn => {
        const rect = btn.getBoundingClientRect();
        return {
          aria: btn.getAttribute('aria-label'),
          text: btn.textContent.trim().substring(0, 40),
          cls: btn.className.substring(0, 60),
          y: Math.round(rect.y),
          x: Math.round(rect.x),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          visible: rect.height > 0 && window.getComputedStyle(btn).display !== 'none'
        };
      }).filter(b => b.y > 0 && b.y < 300);
    });
    console.log('全ボタン (y:0-300):', JSON.stringify(allBtnData, null, 2));
  }

  // Final: Save draft
  const draftSaved = await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.textContent.trim() === '下書き保存') {
        btn.click();
        return true;
      }
    }
    return false;
  });
  console.log('下書き保存:', draftSaved);
  await page.waitForTimeout(3000);

  await page.screenshot({ path: '/tmp/cover837b_final.png', fullPage: false });
  console.log('Final screenshot: /tmp/cover837b_final.png');

  await ctx.close();
  console.log('完了');
})();
