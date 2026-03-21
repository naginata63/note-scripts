const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    console.log('=== Checking email signup flow ===');
    await page.goto('https://www.copainter.ai/ja/auth/signup', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Click email signup button
    const emailBtn = await page.$('text=Eメールで新規登録');
    if (emailBtn) {
      console.log('Found email signup button, clicking...');
      await emailBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/copainter_screenshots/07_email_signup.png', fullPage: true });
      console.log('Email signup URL:', page.url());

      // Get form elements
      const forms = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input, button')).map(el => {
          return `${el.tagName}: type=${el.type || '-'} name=${el.name || '-'} placeholder=${el.placeholder || '-'} id=${el.id || '-'}`;
        }).join('\n');
      });
      console.log('Form elements after click:', forms);

      const pageText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
      console.log('Page text:', pageText);
    } else {
      console.log('Email signup button not found');
    }

    // Also check aiAssistant page
    console.log('\n=== AIアシスタント page ===');
    await page.goto('https://www.copainter.ai/ja/aiAssistant', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: '/tmp/copainter_screenshots/08_ai_assistant.png', fullPage: true });
    const aiText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    console.log('AI Assistant text:', aiText);

  } catch (e) {
    console.error('Error:', e.message);
    try { await page.screenshot({ path: '/tmp/copainter_screenshots/error5.png' }); } catch {}
  } finally {
    await browser.close();
  }
})();
