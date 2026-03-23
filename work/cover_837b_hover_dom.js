/**
 * cover_837b_hover_dom.js
 * eyecatch画像のDOM構造を詳しく調べて、hover後の変化を確認
 */
const { chromium } = require('@playwright/test');
const path = require('path');

const USER_DATA_DIR = '/home/murakami/.cache/ms-playwright/note-cli-profile';
const NOTE_URL = 'https://editor.note.com/notes/n7a0a5b5fb294/edit/';
const IMAGE_PATH = path.resolve(__dirname, 'cover_837b.png');

(async () => {
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

  // DOM structure of eyecatch area
  const eyecatchDOM = await page.evaluate(() => {
    const img = document.querySelector('img.h-auto.w-full.align-top');
    if (!img) return 'IMG not found';

    function getAncestors(el, depth) {
      if (depth === 0 || !el) return null;
      return {
        tag: el.tagName,
        cls: el.className.substring(0, 100),
        id: el.id,
        childCount: el.children.length,
        children: Array.from(el.children).map(c => ({
          tag: c.tagName,
          cls: c.className.substring(0, 100),
          visible: c.getBoundingClientRect().height > 0,
          btns: Array.from(c.querySelectorAll('button')).map(b => ({
            aria: b.getAttribute('aria-label'),
            text: b.textContent.trim().substring(0, 30),
            visible: b.getBoundingClientRect().height > 0
          }))
        })),
        parent: getAncestors(el.parentElement, depth - 1)
      };
    }
    return getAncestors(img.parentElement, 5);
  });
  console.log('Eyecatch DOM:', JSON.stringify(eyecatchDOM, null, 2));

  // Hover over the eyecatch image
  const imgEl = await page.$('img.h-auto.w-full.align-top');
  if (imgEl) {
    console.log('画像に直接ホバー...');
    await imgEl.hover();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/cover837b_img_hover.png' });
    console.log('Hover screenshot: /tmp/cover837b_img_hover.png');

    // Re-check DOM after hover
    const afterHoverDOM = await page.evaluate(() => {
      const img = document.querySelector('img.h-auto.w-full.align-top');
      if (!img) return null;
      const container = img.closest('[class*="relative"]') || img.parentElement;
      if (!container) return null;
      const allBtns = container.querySelectorAll('button, [role="button"], a');
      return Array.from(allBtns).map(b => ({
        tag: b.tagName,
        aria: b.getAttribute('aria-label'),
        text: b.textContent.trim().substring(0, 40),
        cls: b.className.substring(0, 60),
        visible: b.getBoundingClientRect().height > 0,
        y: Math.round(b.getBoundingClientRect().y)
      }));
    });
    console.log('Hover後 container内ボタン:', JSON.stringify(afterHoverDOM, null, 2));

    // Also check for any overlays appearing
    const overlayInfo = await page.evaluate(() => {
      const overlays = document.querySelectorAll('[class*="overlay"], [class*="Overlay"], [class*="mask"], [class*="Mask"]');
      return Array.from(overlays).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.y < 300 && rect.height > 0;
      }).map(el => ({
        cls: el.className.substring(0, 80),
        y: Math.round(el.getBoundingClientRect().y),
        visible: el.getBoundingClientRect().height > 0
      }));
    });
    console.log('Overlay要素:', JSON.stringify(overlayInfo));
  }

  // Try clicking on the image with mouse
  console.log('画像を左クリック...');
  await page.mouse.click(310, 140);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/cover837b_left_click.png' });
  console.log('Left click screenshot: /tmp/cover837b_left_click.png');

  // Check buttons that appeared
  const afterClickBtns = await page.evaluate(() => {
    const img = document.querySelector('img.h-auto.w-full.align-top');
    if (!img) return [];
    const container = img.parentElement;
    if (!container) return [];
    const allEls = container.parentElement ? container.parentElement.querySelectorAll('button, [role="button"]') : container.querySelectorAll('button');
    return Array.from(allEls).map(b => ({
      aria: b.getAttribute('aria-label'),
      text: b.textContent.trim().substring(0, 40),
      visible: b.getBoundingClientRect().height > 0,
      y: Math.round(b.getBoundingClientRect().y),
      display: window.getComputedStyle(b).display,
      opacity: window.getComputedStyle(b).opacity
    }));
  });
  console.log('クリック後ボタン:', JSON.stringify(afterClickBtns, null, 2));

  // Try FileChooser approach: if there's a hidden file input near the eyecatch
  const fileInputs = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="file"]');
    return Array.from(inputs).map(inp => ({
      cls: inp.className.substring(0, 60),
      accept: inp.getAttribute('accept'),
      y: Math.round(inp.getBoundingClientRect().y)
    }));
  });
  console.log('File inputs:', JSON.stringify(fileInputs));

  await ctx.close();
  console.log('診断完了');
})();
