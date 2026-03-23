/**
 * cover_837b_add.js
 * 既存カバー削除済み → 「+」ボタンをクリックして新しい画像をアップロード
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
  await page.waitForTimeout(1000);

  await page.screenshot({ path: '/tmp/cover837b_add_before.png' });
  console.log('Before screenshot: /tmp/cover837b_add_before.png');

  // Find all buttons with their info
  const allBtns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(btn => {
      const rect = btn.getBoundingClientRect();
      return {
        aria: btn.getAttribute('aria-label'),
        text: btn.textContent.trim().substring(0, 40),
        cls: btn.className.substring(0, 60),
        y: Math.round(rect.y),
        x: Math.round(rect.x),
        w: Math.round(rect.width),
        h: Math.round(rect.height)
      };
    }).filter(b => b.y > 0 && b.y < 300 && b.h > 0);
  });
  console.log('ボタンリスト (y:0-300):');
  for (const btn of allBtns) {
    console.log(`  aria="${btn.aria}" text="${btn.text}" cls="${btn.cls.substring(0, 40)}" y=${btn.y} x=${btn.x}`);
  }

  // Click the + eyecatch add button (circular button near top)
  // Based on screenshot it's at approximately (336, 127)
  // Look for button with circle icon near the cover area
  // The sc-131cded0-4 button might now be the "+" button since cover is removed
  const addCoverBtn = await page.$('.sc-131cded0-0 button, .doUWus button');
  if (addCoverBtn) {
    const bbox = await addCoverBtn.boundingBox();
    const aria = await addCoverBtn.getAttribute('aria-label');
    const text = await addCoverBtn.textContent();
    console.log(`カバー追加ボタン: y=${bbox ? Math.round(bbox.y) : 'null'} x=${bbox ? Math.round(bbox.x) : 'null'} aria="${aria}" text="${text.substring(0, 40)}"`);

    console.log('FileChooserを待機してボタンクリック...');
    try {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10000 }),
        addCoverBtn.click(),
      ]);
      console.log('FileChooser直接取得成功！');
      await fileChooser.setFiles(IMAGE_PATH);
      console.log('ファイル設定完了:', IMAGE_PATH);
      await page.waitForTimeout(3000);
    } catch (e) {
      console.log('FileChooser直接失敗:', e.message.substring(0, 100));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: '/tmp/cover837b_add_submenu.png' });
      console.log('Submenu screenshot: /tmp/cover837b_add_submenu.png');

      // Check for submenu
      const submenuBtns = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).map(btn => {
          const rect = btn.getBoundingClientRect();
          return { aria: btn.getAttribute('aria-label'), text: btn.textContent.trim().substring(0, 40), y: Math.round(rect.y), x: Math.round(rect.x), h: Math.round(rect.height) };
        }).filter(b => b.y > 0 && b.y < 400 && b.h > 0);
      });
      console.log('サブメニューボタン:', JSON.stringify(submenuBtns));

      const uploadOpt = await page.$('button:has-text("画像をアップロード")') ||
                        await page.$('button:has-text("アップロード")') ||
                        await page.$('button:has-text("画像")');
      if (uploadOpt) {
        console.log('アップロードボタン発見');
        const [fileChooser2] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 5000 }),
          uploadOpt.click(),
        ]);
        await fileChooser2.setFiles(IMAGE_PATH);
        console.log('ファイル設定完了（サブメニュー経由）');
        await page.waitForTimeout(3000);
      }
    }

    // Check for CropModal
    await page.screenshot({ path: '/tmp/cover837b_after_upload.png' });
    console.log('After upload screenshot: /tmp/cover837b_after_upload.png');

    const cropModal = await page.$('.CropModal__content');
    if (cropModal) {
      console.log('CropModal表示');
      await page.screenshot({ path: '/tmp/cover837b_cropmodal.png' });
      const okClicked = await page.evaluate(() => {
        const modal = document.querySelector('.CropModal__content');
        if (!modal) return null;
        const btns = Array.from(modal.querySelectorAll('button'));
        console.log('CropModal buttons:', btns.map(b => b.textContent.trim()).join(', '));
        for (const btn of btns) {
          const text = btn.textContent.trim();
          if (['保存', 'OK', '適用', '完了', '設定する', 'クロップして保存', 'トリミングして保存'].includes(text)) {
            btn.click();
            return text;
          }
        }
        return 'NOT_FOUND: ' + btns.map(b => b.textContent.trim()).join(', ');
      });
      console.log('CropModal保存クリック:', okClicked);
      await page.waitForTimeout(8000);
      await page.screenshot({ path: '/tmp/cover837b_after_crop.png' });
      console.log('After crop screenshot: /tmp/cover837b_after_crop.png');
    } else {
      // Check for other modals
      const modals = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[role="dialog"], [class*="Modal"], [class*="Crop"]'))
          .filter(el => el.getBoundingClientRect().height > 0)
          .map(el => ({ cls: el.className.substring(0, 80), text: el.textContent.trim().substring(0, 60) }));
      });
      if (modals.length > 0) {
        console.log('その他Modal:', JSON.stringify(modals));
      } else {
        console.log('Modal未表示 - 直接保存');
      }
    }
  } else {
    console.log('カバー追加ボタン未発見');
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
  console.log('下書き保存:', draftSaved);
  await page.waitForTimeout(3000);

  await page.screenshot({ path: '/tmp/cover837b_final.png', fullPage: false });
  console.log('Final screenshot: /tmp/cover837b_final.png');

  await ctx.close();
  console.log('完了');
})();
