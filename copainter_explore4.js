const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // Check signup page with longer wait
    console.log('=== Signup page with JS wait ===');
    await page.goto('https://www.copainter.ai/ja/auth/signup', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/copainter_screenshots/05_signup.png', fullPage: true });
    console.log('Signup URL:', page.url());

    // Get all form elements
    const forms = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, button, a[href]')).map(el => {
        return `${el.tagName}: type=${el.type || '-'} name=${el.name || '-'} placeholder=${el.placeholder || '-'} text=${el.textContent?.trim()?.substring(0, 50) || '-'} href=${el.href || '-'}`;
      });
      return inputs.join('\n');
    });
    console.log('Form elements:', forms);

    // Also check img2img which is the closest thing to expression variants
    console.log('\n=== img2img page ===');
    await page.goto('https://www.copainter.ai/ja/img2img', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: '/tmp/copainter_screenshots/06_img2img.png', fullPage: true });
    const img2imgText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
    console.log('img2img text:', img2imgText);

  } catch (e) {
    console.error('Error:', e.message);
    try { await page.screenshot({ path: '/tmp/copainter_screenshots/error4.png' }); } catch {}
  } finally {
    await browser.close();
  }
})();
