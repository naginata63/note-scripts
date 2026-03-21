const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    console.log('Navigating to copainter.ai...');
    await page.goto('https://copainter.ai/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: '/tmp/copainter_screenshots/01_homepage.png', fullPage: true });
    console.log('Homepage screenshot taken');
    console.log('URL:', page.url());
    console.log('Title:', await page.title());

    // Get page text to understand structure
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    console.log('Page text:', bodyText);

  } catch (e) {
    console.error('Error:', e.message);
    await page.screenshot({ path: '/tmp/copainter_screenshots/error.png' });
  } finally {
    await browser.close();
  }
})();
