const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CREDS_PATH = path.join(os.homedir(), '.config', 'copainter', 'creds.json');
const CREDS = JSON.parse(fs.readFileSync(CREDS_PATH));
// アセットベースディレクトリ。環境変数 DOZLE_KIRINUKI_DIR でoverride可能
const BASE_DIR = process.env.DOZLE_KIRINUKI_DIR || '/home/murakami/multi-agent-shogun/projects/dozle_kirinuki';
const OUTPUT_DIR = path.join(BASE_DIR, 'assets/dozle_jp/character/expressions/copainter');
const CHAR_DIR = path.join(BASE_DIR, 'assets/dozle_jp/character');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const GENERATIONS = [
  {
    char: 'dozle',
    file: path.join(CHAR_DIR, 'dozle.png'),
    prompt: 'このキャラクターを笑わせて。スマイル表情に変えて。服装や体は変えないで。',
    outputName: 'dozle_smile.png'
  },
  {
    char: 'dozle',
    file: path.join(CHAR_DIR, 'dozle.png'),
    prompt: 'このキャラクターを怒った表情にして。眉を顰めて怒り顔に変えて。服装や体は変えないで。',
    outputName: 'dozle_angry.png'
  },
  {
    char: 'dozle',
    file: path.join(CHAR_DIR, 'dozle.png'),
    prompt: 'このキャラクターを驚いた表情にして。目を見開いて驚き顔に変えて。服装や体は変えないで。',
    outputName: 'dozle_surprised.png'
  },
  {
    char: 'bonjour',
    file: path.join(CHAR_DIR, 'bonjour.png'),
    prompt: 'このキャラクターを笑わせて。スマイル表情に変えて。服装や体は変えないで。',
    outputName: 'bonjour_smile.png'
  },
  {
    char: 'qnly',
    file: path.join(CHAR_DIR, 'qnly.png'),
    prompt: 'このキャラクターを笑わせて。スマイル表情に変えて。服装や体は変えないで。',
    outputName: 'qnly_smile.png'
  },
];

async function loginAndAgreeTerms(page) {
  await page.goto('https://www.copainter.ai/ja/auth/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);

  const emailBtn = await page.$('text=Eメールでログイン');
  if (emailBtn) { await emailBtn.click(); await page.waitForTimeout(1000); }

  await page.fill('input[type="email"]', CREDS.email);
  await page.fill('input[type="password"]', CREDS.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForTimeout(3000);

  if (page.url().includes('term')) {
    await page.getByRole('button', { name: '同意する' }).click();
    await page.waitForTimeout(2000);
  }
  console.log('Logged in. URL:', page.url());
}

async function generateImage(page, gen, index) {
  console.log(`\n=== Generation ${index + 1}/${GENERATIONS.length}: ${gen.outputName} ===`);
  const screenshotDir = '/tmp/copainter_screenshots';

  // Navigate to tool - track network requests
  const generatedImageUrls = [];
  const requestHandler = (request) => {
    const url = request.url();
    // Track copainter image responses
    if (url.includes('copainter') && (url.includes('.png') || url.includes('.jpg') || url.includes('.webp') || url.includes('/outputs/') || url.includes('/generated/'))) {
      console.log('Image request:', url.substring(0, 150));
      generatedImageUrls.push(url);
    }
  };
  page.on('request', requestHandler);

  // Also track responses
  const responseHandler = async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    if (contentType.startsWith('image/') && url.includes('copainter') && !url.includes('logo') && !url.includes('icon')) {
      console.log('Image response:', url.substring(0, 150), contentType);
    }
  };
  page.on('response', responseHandler);

  try {
    await page.goto('https://www.copainter.ai/ja/my/aiAssistant', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${screenshotDir}/g${index+1}_start.png` });

    // Check ticket count
    const ticketInfo = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const ticketBtn = btns.find(b => /\d+/.test(b.textContent));
      return ticketBtn?.textContent?.trim() || 'unknown';
    });
    console.log('Current tickets:', ticketInfo);

    // Upload image
    console.log('Uploading image:', gen.file);
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      console.log('File input not found!');
      await page.screenshot({ path: `${screenshotDir}/g${index+1}_no_input.png`, fullPage: true });
      return false;
    }
    await fileInput.setInputFiles(gen.file);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${screenshotDir}/g${index+1}_uploaded.png` });

    // Verify upload
    const uploadStatus = await page.evaluate(() => {
      const text = document.body.innerText;
      const match = text.match(/(\d+)\/(\d+) 枚アップロード/);
      return match ? match[0] : 'status not found';
    });
    console.log('Upload status:', uploadStatus);

    // Enter prompt
    await page.fill('textarea', gen.prompt);
    await page.waitForTimeout(500);
    console.log('Prompt entered');
    await page.screenshot({ path: `${screenshotDir}/g${index+1}_with_prompt.png` });

    // Get images before submit (to detect new ones after)
    const imgsBefore = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img')).map(i => i.src).filter(s => s.startsWith('http') || s.startsWith('blob:'));
    });

    // Submit
    const sendBtn = await page.locator('button').filter({ hasText: '送信' }).first();
    await sendBtn.click();
    console.log('Submitted. Waiting for result...');

    // Wait for new image to appear
    let resultUrl = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      await page.waitForTimeout(3000);
      console.log(`Checking result (${(attempt+1)*3}s)...`);

      // Check for loading indicator gone
      const pageText = await page.evaluate(() => document.body.innerText);
      if (pageText.includes('チケットが不足') || pageText.includes('チケットが足りません')) {
        console.log('OUT OF TICKETS!');
        return false;
      }
      if (pageText.includes('エラー') && attempt > 3) {
        console.log('Error detected on page');
        await page.screenshot({ path: `${screenshotDir}/g${index+1}_error.png`, fullPage: true });
        break;
      }

      // Check for new images that look like generated results
      const imgsAfter = await page.evaluate((imgsBefore) => {
        const allImgs = Array.from(document.querySelectorAll('img'))
          .map(i => ({ src: i.src, width: i.naturalWidth, height: i.naturalHeight, displayWidth: i.offsetWidth }))
          .filter(i => i.src && !imgsBefore.includes(i.src));
        return allImgs;
      }, imgsBefore);

      if (imgsAfter.length > 0) {
        console.log('New images detected:', JSON.stringify(imgsAfter));
        // Pick the largest/most likely generated image
        const candidate = imgsAfter.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
        if (candidate.width > 50 && candidate.height > 50) {
          resultUrl = candidate.src;
          console.log('Result found:', resultUrl.substring(0, 150));
          break;
        }
      }

      // Also check network captured URLs
      if (generatedImageUrls.length > 0) {
        resultUrl = generatedImageUrls[generatedImageUrls.length - 1];
        console.log('Result from network:', resultUrl.substring(0, 150));
        break;
      }

      await page.screenshot({ path: `${screenshotDir}/g${index+1}_wait_${attempt}.png` });
    }

    if (resultUrl) {
      const outputPath = path.join(OUTPUT_DIR, gen.outputName);
      try {
        const response = await page.request.get(resultUrl);
        const buffer = await response.body();
        if (buffer.length > 1000) {
          fs.writeFileSync(outputPath, buffer);
          console.log(`Saved: ${outputPath} (${buffer.length} bytes)`);
          return true;
        } else {
          console.log(`Image too small (${buffer.length} bytes), trying screenshot`);
        }
      } catch (e) {
        console.log('Download error:', e.message);
      }

      // Fallback: find the image element and screenshot it
      const imgEl = await page.$(`img[src="${resultUrl}"]`);
      if (imgEl) {
        await imgEl.screenshot({ path: outputPath });
        const stat = fs.statSync(outputPath);
        console.log(`Saved (element screenshot): ${outputPath} (${stat.size} bytes)`);
        return stat.size > 1000;
      }
    }

    // Last resort: screenshot the result area
    await page.screenshot({ path: `${screenshotDir}/g${index+1}_final.png`, fullPage: true });
    console.log('No result captured. Final screenshot saved.');
    return false;

  } finally {
    page.off('request', requestHandler);
    page.off('response', responseHandler);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, slowMo: 100 });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    acceptDownloads: true
  });
  const page = await context.newPage();

  const results = [];

  try {
    await loginAndAgreeTerms(page);

    for (let i = 0; i < GENERATIONS.length; i++) {
      const success = await generateImage(page, GENERATIONS[i], i);
      results.push({ gen: GENERATIONS[i].outputName, success });
      if (!success) {
        console.log(`Generation ${i+1} failed. Continuing with next...`);
      }
      // Small delay between generations
      await page.waitForTimeout(2000);
    }

    console.log('\n=== FINAL RESULTS ===');
    results.forEach(r => console.log(`${r.success ? '✓' : '✗'} ${r.gen}`));

    const files = fs.existsSync(OUTPUT_DIR) ? fs.readdirSync(OUTPUT_DIR) : [];
    console.log('\nOutput directory files:', files);

  } catch (e) {
    console.error('Fatal error:', e.message);
    console.error(e.stack);
    try { await page.screenshot({ path: '/tmp/copainter_screenshots/fatal.png', fullPage: true }); } catch {}
  } finally {
    await browser.close();
  }
})();
