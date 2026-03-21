const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CREDS_PATH = path.join(os.homedir(), '.config', 'copainter', 'creds.json');
const CREDS = JSON.parse(fs.readFileSync(CREDS_PATH));
const OUTPUT_DIR = '/home/murakami/multi-agent-shogun/projects/dozle_kirinuki/assets/dozle_jp/character/expressions/copainter';
const CHAR_DIR = '/home/murakami/multi-agent-shogun/projects/dozle_kirinuki/assets/dozle_jp/character';

// Ensure output dir exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const GENERATIONS = [
  { char: 'dozle', file: 'dozle.png', prompt: 'smile, happy expression, same character', outputName: 'dozle_smile' },
  { char: 'dozle', file: 'dozle.png', prompt: 'angry expression, same character', outputName: 'dozle_angry' },
  { char: 'dozle', file: 'dozle.png', prompt: 'surprised expression, open mouth, same character', outputName: 'dozle_surprised' },
  { char: 'bonjour', file: 'bonjour.png', prompt: 'smile, happy expression, same character', outputName: 'bonjour_smile' },
  { char: 'bonjour', file: 'bonjour.png', prompt: 'surprised expression, same character', outputName: 'bonjour_surprised' },
  { char: 'qnly', file: 'qnly.png', prompt: 'smile, happy expression, same character', outputName: 'qnly_smile' },
  { char: 'qnly', file: 'qnly.png', prompt: 'angry expression, same character', outputName: 'qnly_angry' },
  { char: 'oraf-kun', file: 'oraf-kun.png', prompt: 'smile, happy expression, same character', outputName: 'oraf-kun_smile' },
  { char: 'ooharamen', file: 'ooharamen.png', prompt: 'smile, happy expression, same character', outputName: 'ooharamen_smile' },
  { char: 'ooharamen', file: 'ooharamen.png', prompt: 'surprised expression, same character', outputName: 'ooharamen_surprised' },
];

async function downloadImage(page, url, savePath) {
  const response = await page.request.get(url);
  const buffer = await response.body();
  fs.writeFileSync(savePath, buffer);
  console.log('Saved:', savePath);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
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

    const emailBtn = await page.$('text=Eメールでログイン');
    if (emailBtn) {
      await emailBtn.click();
      await page.waitForTimeout(1000);
    }

    await page.fill('input[type="email"]', CREDS.email);
    await page.fill('input[type="password"]', CREDS.password);
    await page.getByText('ログイン').last().click();
    await page.waitForTimeout(3000);

    const loginUrl = page.url();
    console.log('After login URL:', loginUrl);
    await page.screenshot({ path: '/tmp/copainter_screenshots/l1_after_login.png', fullPage: true });

    // Handle terms agreement if needed
    if (loginUrl.includes('term') || (await page.evaluate(() => document.body.innerText)).includes('同意する')) {
      console.log('Agreeing to terms...');
      await page.getByRole('button', { name: '同意する' }).click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/copainter_screenshots/l2_after_terms.png', fullPage: true });
      console.log('After terms URL:', page.url());
    }

    // Navigate to AI Assistant
    console.log('Navigating to AIアシスタント...');
    await page.goto('https://www.copainter.ai/ja/aiAssistant', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/copainter_screenshots/l3_ai_assistant.png', fullPage: true });
    console.log('AI Assistant URL:', page.url());

    // Check if we're on the tool or still on info page
    const toolText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    console.log('Page text:', toolText.substring(0, 500));

    // Look for "ツールを使う" or "利用する" button to enter the tool
    const useBtn = await page.$('text=ツールを使う');
    if (useBtn) {
      console.log('Found "ツールを使う" button, clicking...');
      await useBtn.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: '/tmp/copainter_screenshots/l4_tool_page.png', fullPage: true });
      console.log('Tool page URL:', page.url());
    }

    // Check what we have now
    const pageText2 = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    console.log('Page text after:', pageText2.substring(0, 500));

    // Look for the actual tool interface
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, textarea, button')).map(el => {
        return `${el.tagName}: type=${el.type || '-'} placeholder=${el.placeholder || '-'} text=${el.textContent?.trim()?.substring(0, 50) || '-'}`;
      }).join('\n');
    });
    console.log('Interface elements:', inputs);

    await page.screenshot({ path: '/tmp/copainter_screenshots/l5_current.png', fullPage: true });

  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
    try { await page.screenshot({ path: '/tmp/copainter_screenshots/err_use.png', fullPage: true }); } catch {}
  } finally {
    await browser.close();
  }
})();
