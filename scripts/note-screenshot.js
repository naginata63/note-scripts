#!/usr/bin/env node
const { chromium } = require('playwright');
const path = require('path');

const args = process.argv.slice(2);
const urlArg = args.find(a => a.startsWith('--url='));
const outputArg = args.find(a => a.startsWith('--output='));
if (!urlArg || !outputArg) {
  console.error('Usage: node note-screenshot.js --url=<url> --output=<path>');
  process.exit(1);
}
const url = urlArg.replace('--url=', '');
const outputPath = outputArg.replace('--output=', '');
const USER_DATA_DIR = '/home/murakami/.cache/ms-playwright/note-cli-profile';

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { headless: false });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  console.log('現在URL:', currentUrl);
  if (!currentUrl.includes('editor.note.com') && !currentUrl.includes('note.com')) {
    console.error('ERROR: noteエディタ画面に到達できていません');
    await ctx.close();
    process.exit(1);
  }

  const absOutput = path.isAbsolute(outputPath)
    ? outputPath
    : path.join(process.cwd(), outputPath);

  await page.screenshot({ path: absOutput, fullPage: true });
  console.log('フルページスクショ保存:', absOutput);
  await ctx.close();
})();
