const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // Check login page and find signup link
    console.log('=== Checking login page ===');
    await page.goto('https://www.copainter.ai/ja', { waitUntil: 'networkidle', timeout: 30000 });

    // Find all links on the page
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]')).map(a => a.href + ' | ' + a.textContent.trim()).slice(0, 50);
    });
    console.log('Links:', links.join('\n'));

    // Click on 新規登録
    const registerBtn = await page.$('text=新規登録');
    if (registerBtn) {
      await registerBtn.click();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: '/tmp/copainter_screenshots/04_register_click.png', fullPage: true });
      console.log('Register page URL:', page.url());
      console.log('Register page text:', await page.evaluate(() => document.body.innerText.substring(0, 2000)));
    } else {
      console.log('Register button not found');
    }

  } catch (e) {
    console.error('Error:', e.message);
    try { await page.screenshot({ path: '/tmp/copainter_screenshots/error3.png' }); } catch {}
  } finally {
    await browser.close();
  }
})();
