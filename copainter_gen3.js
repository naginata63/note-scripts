const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CREDS_PATH = path.join(os.homedir(), '.config', 'copainter', 'creds.json');
const CREDS = JSON.parse(fs.readFileSync(CREDS_PATH));
const OUTPUT_DIR = '/home/murakami/multi-agent-shogun/projects/dozle_kirinuki/assets/dozle_jp/character/expressions/copainter';
const CHAR_DIR = '/home/murakami/multi-agent-shogun/projects/dozle_kirinuki/assets/dozle_jp/character';

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

async function closeTutorialOverlay(page) {
  // Check for overlay/modal
  const overlay = await page.$('div.fixed.inset-0');
  if (overlay) {
    console.log('Found overlay, closing...');
    // Try pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Check if still there
    const stillThere = await page.$('div.fixed.inset-0');
    if (stillThere) {
      // Try clicking outside the modal
      await page.mouse.click(10, 10);
      await page.waitForTimeout(500);
    }

    // If still there, try to find and click close button
    const closeBtn = await page.$('button[aria-label="Close"]') ||
                     await page.$('button[aria-label="閉じる"]') ||
                     await page.$('div.fixed.inset-0 button');
    if (closeBtn) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }

    // Force remove via JS if needed
    const overlayStillPresent = await page.$('div.fixed.inset-0');
    if (overlayStillPresent) {
      console.log('Removing overlay via JS');
      await page.evaluate(() => {
        const overlays = document.querySelectorAll('div.fixed.inset-0, div[class*="fixed inset-0"]');
        overlays.forEach(el => el.remove());
      });
      await page.waitForTimeout(300);
    }
  }
}

async function generateImage(page, gen, index) {
  console.log(`\n=== Generation ${index + 1}/${GENERATIONS.length}: ${gen.outputName} ===`);
  const screenshotDir = '/tmp/copainter_screenshots';

  // Track Firebase storage URLs for results
  const resultImageUrls = [];
  const requestHandler = (request) => {
    const url = request.url();
    if (url.includes('firebasestorage.googleapis.com') && url.includes('copainter')) {
      console.log('Firebase image request:', url.substring(0, 200));
      resultImageUrls.push(url);
    }
  };
  page.on('request', requestHandler);

  try {
    await page.goto('https://www.copainter.ai/ja/my/aiAssistant', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    // Close tutorial overlay if present
    await closeTutorialOverlay(page);
    await page.screenshot({ path: `${screenshotDir}/g${index+1}_start.png` });

    // Check tickets
    const ticketInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      const match = text.match(/(\d+)/);
      return match ? match[1] : 'unknown';
    });
    console.log('Tickets visible:', ticketInfo);

    // Upload image
    console.log('Uploading:', gen.file);
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      console.log('File input not found!');
      return false;
    }
    await fileInput.setInputFiles(gen.file);
    await page.waitForTimeout(3000);

    // Verify upload
    const uploadStatus = await page.evaluate(() => {
      const match = document.body.innerText.match(/(\d+)\/(\d+) 枚アップロード/);
      return match ? match[0] : 'not found';
    });
    console.log('Upload status:', uploadStatus);

    if (uploadStatus === 'not found' || uploadStatus.startsWith('0/')) {
      console.log('Upload may have failed');
      await page.screenshot({ path: `${screenshotDir}/g${index+1}_upload_fail.png` });
    }

    // Enter prompt
    await page.fill('textarea', gen.prompt);
    await page.waitForTimeout(500);
    console.log('Prompt entered');

    await page.screenshot({ path: `${screenshotDir}/g${index+1}_ready.png` });

    // Reset URL tracking
    resultImageUrls.length = 0;
    const imgsBefore = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img')).map(i => i.src).filter(s => s.length > 0);
    });

    // Click submit using data attribute
    console.log('Submitting...');
    const submitEl = await page.$('[data-ticket-submit="true"]');
    if (submitEl) {
      // Force click via JS to bypass overlay
      await page.evaluate(el => el.click(), submitEl);
      console.log('Clicked via JS (bypass overlay)');
    } else {
      await page.click('[data-ticket-submit="true"]');
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${screenshotDir}/g${index+1}_submitted.png` });

    // Wait for Firebase storage URL to appear
    console.log('Waiting for generation...');
    let resultUrl = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      await page.waitForTimeout(3000);
      console.log(`Checking... ${(attempt+1)*3}s`);

      // Check for out-of-tickets
      const pageText = await page.evaluate(() => document.body.innerText);
      if (pageText.includes('チケットが不足') || pageText.includes('チケットが足りません') || pageText.includes('0枚')) {
        console.log('OUT OF TICKETS!');
        return false;
      }

      // Check network for result URLs
      if (resultImageUrls.length > 0) {
        // Filter to exclude input images
        const outputUrls = resultImageUrls.filter(u => !u.includes('input') && u.length > 100);
        if (outputUrls.length > 0) {
          resultUrl = outputUrls[outputUrls.length - 1];
          console.log('Result URL (network):', resultUrl.substring(0, 150));
          break;
        }
      }

      // Also check DOM for new images
      const imgsAfter = await page.evaluate((imgsBefore) => {
        const allImgs = Array.from(document.querySelectorAll('img'))
          .map(i => ({ src: i.src, width: i.naturalWidth, height: i.naturalHeight }))
          .filter(i => {
            const src = i.src;
            return src.length > 0 &&
                   !imgsBefore.includes(src) &&
                   (src.includes('firebasestorage') || src.includes('blob:')) &&
                   i.width > 50 && i.height > 50;
          });
        return allImgs;
      }, imgsBefore);

      if (imgsAfter.length > 0) {
        resultUrl = imgsAfter[0].src;
        console.log('Result URL (DOM):', resultUrl.substring(0, 150));
        break;
      }

      // Check if still loading
      const loadingIndicator = await page.$('[class*="loading"], [class*="spinner"]');
      if (!loadingIndicator && attempt > 5) {
        // Maybe it finished without a new image? Check page content
        const historyText = await page.evaluate(() => {
          const histEl = document.querySelector('[class*="history"], [class*="result"]');
          return histEl?.innerText?.substring(0, 200) || null;
        });
        if (historyText && !historyText.includes('履歴がありません')) {
          console.log('History content:', historyText);
        }
      }
    }

    if (!resultUrl) {
      await page.screenshot({ path: `${screenshotDir}/g${index+1}_no_result.png`, fullPage: true });
      console.log('No result found. Screenshot saved.');
      // Print all firebase URLs caught
      console.log('All caught Firebase URLs:', resultImageUrls);
      return false;
    }

    // Download the result
    const outputPath = path.join(OUTPUT_DIR, gen.outputName);
    try {
      const response = await page.request.get(resultUrl);
      const buffer = await response.body();
      if (buffer.length > 5000) {
        fs.writeFileSync(outputPath, buffer);
        console.log(`Saved: ${outputPath} (${buffer.length} bytes)`);
        return true;
      } else {
        console.log(`Image too small: ${buffer.length} bytes`);
        // Save it anyway for inspection
        fs.writeFileSync(outputPath + '.debug', buffer);
      }
    } catch (e) {
      console.log('Download error:', e.message);
    }

    // Fallback: find image element and screenshot it
    const imgEl = await page.$(`img[src^="https://firebasestorage"]`) ||
                  await page.$(`img[src="${resultUrl}"]`);
    if (imgEl) {
      await imgEl.screenshot({ path: outputPath });
      const stat = fs.statSync(outputPath);
      console.log(`Saved (screenshot): ${outputPath} (${stat.size} bytes)`);
      return stat.size > 5000;
    }

    return false;

  } finally {
    page.off('request', requestHandler);
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
      await page.waitForTimeout(2000);
    }

    console.log('\n=== FINAL RESULTS ===');
    results.forEach(r => console.log(`${r.success ? 'OK' : 'NG'} ${r.gen}`));

    const files = fs.existsSync(OUTPUT_DIR) ? fs.readdirSync(OUTPUT_DIR) : [];
    console.log('\nOutput files:', files);
    files.forEach(f => {
      const stat = fs.statSync(path.join(OUTPUT_DIR, f));
      console.log(`  ${f}: ${stat.size} bytes`);
    });

  } catch (e) {
    console.error('Fatal error:', e.message);
    console.error(e.stack);
    try { await page.screenshot({ path: '/tmp/copainter_screenshots/fatal.png', fullPage: true }); } catch {}
  } finally {
    await browser.close();
  }
})();
