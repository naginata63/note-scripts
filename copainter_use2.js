const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CREDS_PATH = path.join(os.homedir(), '.config', 'copainter', 'creds.json');
const CREDS = JSON.parse(fs.readFileSync(CREDS_PATH));
const OUTPUT_DIR = '/home/murakami/multi-agent-shogun/projects/dozle_kirinuki/assets/dozle_jp/character/expressions/copainter';
const CHAR_DIR = '/home/murakami/multi-agent-shogun/projects/dozle_kirinuki/assets/dozle_jp/character';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, slowMo: 200 });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // Login
    console.log('Logging in...');
    await page.goto('https://www.copainter.ai/ja/auth/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const emailLoginBtn = await page.$('text=Eメールでログイン');
    if (emailLoginBtn) {
      await emailLoginBtn.click();
      await page.waitForTimeout(1000);
    }

    await page.fill('input[type="email"]', CREDS.email);
    await page.fill('input[type="password"]', CREDS.password);
    await page.getByRole('button', { name: 'ログイン' }).click();
    await page.waitForTimeout(3000);

    // Handle terms if needed
    if (page.url().includes('term')) {
      await page.getByRole('button', { name: '同意する' }).click();
      await page.waitForTimeout(2000);
    }

    console.log('Logged in. URL:', page.url());

    // Go to AI Assistant info page first
    await page.goto('https://www.copainter.ai/ja/aiAssistant', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Click to enter the tool
    console.log('Entering AI Assistant tool...');
    await page.getByRole('button', { name: 'AIアシスタントを使ってみる' }).first().click();
    await page.waitForTimeout(5000);

    const toolUrl = page.url();
    console.log('Tool URL:', toolUrl);
    await page.screenshot({ path: '/tmp/copainter_screenshots/t1_tool.png', fullPage: true });

    const toolText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
    console.log('Tool page text:', toolText.substring(0, 1000));

    // Get all interactive elements
    const elements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, textarea, button, label, [role="button"]')).map(el => {
        const rect = el.getBoundingClientRect();
        return `${el.tagName}[${el.type||'-'}]: text="${el.textContent?.trim()?.substring(0,50)||'-'}" placeholder="${el.placeholder||'-'}" visible=${rect.width>0} id="${el.id||'-'}"`;
      }).join('\n');
    });
    console.log('Interactive elements:', elements);

  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
    try { await page.screenshot({ path: '/tmp/copainter_screenshots/err_use2.png', fullPage: true }); } catch {}
  } finally {
    await browser.close();
  }
})();
