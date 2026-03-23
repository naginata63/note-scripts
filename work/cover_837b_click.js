/**
 * cover_837b_click.js
 * cmd_837修正: カバー画像クリックして置き換え
 * IMG(h-auto w-full)をクリック→オプション確認→置き換え
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

  // Check if image is in ProseMirror (embedded content image) or eyecatch
  const domCheck = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    const imgs = document.querySelectorAll('img');
    const results = [];
    for (const img of imgs) {
      const rect = img.getBoundingClientRect();
      const inPM = pm ? pm.contains(img) : false;
      results.push({
        src: img.src.substring(0, 60),
        cls: img.className.substring(0, 60),
        y: Math.round(rect.y),
        inProseMirror: inPM,
        width: Math.round(rect.width),
        parentCls: img.parentElement ? img.parentElement.className.substring(0, 60) : ''
      });
    }
    return results;
  });
  console.log('[cover] 画像リスト:');
  for (const img of domCheck) {
    if (img.y < 300) {
      console.log(`  src="${img.src}" cls="${img.cls}" y=${img.y} inPM=${img.inProseMirror} parentCls="${img.parentCls}"`);
    }
  }

  // Click on the cover image (at approximately y=120)
  console.log('[cover] カバー画像をクリックします (640, 120)...');
  await page.mouse.click(640, 120);
  await page.waitForTimeout(2000);

  await page.screenshot({ path: '/tmp/cover837b_clicked.png' });
  console.log('[cover] Clicked screenshot: /tmp/cover837b_clicked.png');

  // Check what buttons appeared after click
  const clickedBtns = await page.$$('button');
  console.log('[cover] クリック後ボタン (y>0):');
  for (const btn of clickedBtns) {
    const bbox = await btn.boundingBox();
    const aria = await btn.getAttribute('aria-label');
    const text = await btn.textContent().catch(() => '');
    if (bbox && bbox.y > 0 && bbox.y < 400) {
      console.log(`  aria="${aria}" text="${text.trim().substring(0, 40)}" y=${Math.round(bbox.y)} x=${Math.round(bbox.x)}`);
    }
  }

  // Check floating toolbar buttons (y < 0 might mean toolbar is floating above)
  const allBtns = await page.$$('button');
  console.log('[cover] 全ボタン (aria含む):');
  for (const btn of allBtns) {
    const aria = await btn.getAttribute('aria-label');
    if (aria && (aria.includes('削除') || aria.includes('変更') || aria.includes('replace') || aria.includes('delete') || aria.includes('拡大') || aria.includes('縮小'))) {
      const bbox = await btn.boundingBox();
      const visible = await btn.isVisible();
      console.log(`  aria="${aria}" bbox_y=${bbox ? Math.round(bbox.y) : 'null'} visible=${visible}`);
    }
  }

  // Check if a toolbar appeared with image-related buttons
  const toolbarInfo = await page.evaluate(() => {
    // Look for toolbar elements that contain image controls
    const toolbars = document.querySelectorAll('[class*="toolbar"], [class*="Toolbar"], [class*="menu"], [class*="Menu"]');
    const result = [];
    for (const tb of toolbars) {
      const rect = tb.getBoundingClientRect();
      if (rect.height > 0 && rect.height < 200) {
        result.push({
          cls: tb.className.substring(0, 80),
          y: Math.round(rect.y),
          text: tb.textContent.trim().substring(0, 60),
          btns: Array.from(tb.querySelectorAll('button')).map(b => b.getAttribute('aria-label') || b.textContent.trim().substring(0, 20))
        });
      }
    }
    return result;
  });
  console.log('[cover] Toolbar elements:');
  for (const tb of toolbarInfo) {
    if (tb.btns.length > 0) {
      console.log(`  cls="${tb.cls}" y=${tb.y} btns=${JSON.stringify(tb.btns)}`);
    }
  }

  await ctx.close();
  console.log('[cover] 診断完了');
})();
