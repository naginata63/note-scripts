#!/usr/bin/env node
/**
 * note-finalize.js <editor_url> <cover_image> <draft_path>
 *
 * 1つのブラウザセッションで以下をまとめて実行する:
 *   1. カバー画像を設定（CropModal→保存）
 *   2. インライン画像を挿入（スクリーンショットプレースホルダー）
 */
const NOTE_SCRIPTS_DIR = process.env.NOTE_SCRIPTS_DIR ||
  require('path').join(require('os').homedir(), 'note-scripts');
const { chromium } = require(require('path').join(NOTE_SCRIPTS_DIR, 'node_modules/playwright'));
const fs = require('fs');
const path = require('path');

const [,, editorUrl, coverImage, draftPath] = process.argv;
if (!editorUrl) {
  console.error('使い方: node note-finalize.js <editor_url> [cover_image] [draft_path]');
  process.exit(1);
}

// プレースホルダーを抽出
function parsePlaceholders(draftPath) {
  if (!draftPath || !fs.existsSync(draftPath)) return [];
  const content = fs.readFileSync(draftPath, 'utf-8');
  const results = [];
  const re = /（スクリーンショット：([^）]+)）/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const name = m[1].trim();
    const imgPath = path.join(path.dirname(draftPath), 'images', `${name}.png`);
    if (fs.existsSync(imgPath)) {
      results.push({ placeholder: m[0], name, imagePath: imgPath });
    } else {
      console.warn(`[finalize] 画像が見つかりません: ${imgPath}`);
    }
  }
  return results;
}

const PROFILE_DIR = process.env.NOTE_PROFILE_DIR ||
  `${process.env.HOME}/Library/Caches/ms-playwright/note-cli-profile`;

(async () => {
  const browser = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false });
  const page = await browser.newPage();

  console.log(`[finalize] エディタを開きます: ${editorUrl}`);
  await page.goto(editorUrl);
  await page.waitForTimeout(2000);

  // ── 1. カバー画像 ──────────────────────────────────────
  const absCover = coverImage ? path.resolve(coverImage) : null;
  if (absCover && fs.existsSync(absCover)) {
    console.log('[finalize] カバー画像を設定します');

    const coverBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => {
        const rect = b.getBoundingClientRect();
        return rect.y > 50 && rect.y < 200 && rect.x > 200 && rect.x < 600 &&
               rect.width > 30 && rect.height > 30;
      }) || null;
    });

    if (coverBtn.asElement()) {
      await coverBtn.asElement().click({ force: true });
      await page.waitForTimeout(800);

      const uploadBtn = await page.$('button:has-text("画像をアップロード")');
      if (uploadBtn) {
        const [fc] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 5000 }),
          uploadBtn.click(),
        ]);
        await fc.setFiles(absCover);
        await page.waitForTimeout(3000);

        try {
          await page.waitForSelector('.ReactModal__Content', { timeout: 5000 });
          const saveBtn = await page.$('.ReactModal__Content button:has-text("保存")');
          if (saveBtn) {
            await saveBtn.click();
            await page.waitForTimeout(2000);
            console.log('[finalize] カバー画像を保存しました');
          }
        } catch (_) {}
      }
    } else {
      console.warn('[finalize] カバー画像ボタンが見つかりません');
    }
  }

  // ── 2. インライン画像 ──────────────────────────────────
  const placeholders = parsePlaceholders(draftPath);
  if (placeholders.length > 0) {
    console.log(`[finalize] インライン画像 ${placeholders.length}件を処理します`);

    for (const { placeholder, name, imagePath } of placeholders) {
      console.log(`[finalize] 処理中: ${name}`);

      const para = await page.evaluateHandle((text) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.textContent.includes(text)) return node.parentElement;
        }
        return null;
      }, placeholder);

      if (!para.asElement()) {
        console.warn(`[finalize] プレースホルダーが見つかりません: ${placeholder}`);
        continue;
      }

      // プレースホルダーテキストを全選択→削除して空行に
      await page.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }, para.asElement());
      await page.waitForTimeout(300);
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);

      // 空行にホバー→「+」ボタン→画像挿入
      await para.asElement().hover();
      await page.waitForTimeout(600);

      const addBtn = await page.$('button[aria-label="メニューを開く"]');
      if (!addBtn) { console.warn('[finalize] 「メニューを開く」が見つかりません'); continue; }
      await addBtn.click();
      await page.waitForTimeout(600);

      const imgMenuItem = await page.$('button:has-text("画像")');
      if (!imgMenuItem) {
        await page.keyboard.press('Escape');
        console.warn('[finalize] 「画像」メニューが見つかりません');
        continue;
      }

      const [fc] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }),
        imgMenuItem.click(),
      ]);
      await fc.setFiles(imagePath);
      console.log(`[finalize] アップロード完了: ${name}`);
      await page.waitForTimeout(3000);
    }
  }

  // ── 3. 下書き保存 ──────────────────────────────────────
  const saveBtn = await page.$('button:has-text("下書き保存")');
  if (saveBtn) {
    await saveBtn.click();
    await page.waitForTimeout(1500);
    console.log('[finalize] 下書き保存しました');
  }

  await browser.close();
  console.log('[finalize] 完了');
})().catch(e => {
  console.error('[finalize] エラー:', e.message);
  process.exit(1);
});
