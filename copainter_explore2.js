const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // Check the pricing/plan page
    console.log('=== Checking plan page ===');
    await page.goto('https://copainter.ai/ja/plan', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: '/tmp/copainter_screenshots/02_plan.png', fullPage: true });
    console.log('Plan URL:', page.url());
    const planText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
    console.log('Plan text:', planText);

    // Check register/signup page
    console.log('\n=== Checking signup page ===');
    await page.goto('https://copainter.ai/ja/auth/register', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: '/tmp/copainter_screenshots/03_register.png', fullPage: true });
    console.log('Register URL:', page.url());
    const registerText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    console.log('Register text:', registerText);

  } catch (e) {
    console.error('Error:', e.message);
    await page.screenshot({ path: '/tmp/copainter_screenshots/error2.png' });
  } finally {
    await browser.close();
  }
})();
