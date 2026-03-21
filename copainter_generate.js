const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CREDS_PATH = path.join(os.homedir(), '.config', 'copainter', 'creds.json');
const CREDS = JSON.parse(fs.readFileSync(CREDS_PATH));
const OUTPUT_DIR = '/home/murakami/multi-agent-shogun/projects/dozle_kirinuki/assets/dozle_jp/character/expressions/copainter';
const CHAR_DIR = '/home/murakami/multi-agent-shogun/projects/dozle_kirinuki/assets/dozle_jp/character';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// 10 tickets = 5 generations (2 tickets each)
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
  console.log(`\n=== Generation ${index + 1}/5: ${gen.outputName} ===`);

  // Navigate to tool
  await page.goto('https://www.copainter.ai/ja/my/aiAssistant', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Upload image
  console.log('Uploading:', gen.file);
  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles(gen.file);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `/tmp/copainter_screenshots/g${index+1}_uploaded.png` });
  console.log('Image uploaded');

  // Check if image was uploaded
  const imgCount = await page.$('text=/\\d+\\/3 枚アップロード/');
  const uploadText = await page.evaluate(() => {
    const el = document.querySelector('[class*="upload"]') || document.body;
    return el.textContent?.match(/\d+\/\d+ 枚/)?.[0] || 'unknown';
  });
  console.log('Upload status:', uploadText);

  // Enter prompt
  console.log('Entering prompt:', gen.prompt);
  await page.fill('textarea', gen.prompt);
  await page.waitForTimeout(500);

  await page.screenshot({ path: `/tmp/copainter_screenshots/g${index+1}_ready.png` });

  // Submit
  console.log('Submitting...');
  const submitBtn = await page.$('button[type="submit"]:has-text("送信")') ||
                    await page.$('button:has-text("送信")');
  if (submitBtn) {
    await submitBtn.click();
  } else {
    // Find submit by text
    await page.click('button >> text=送信');
  }
  console.log('Submitted. Waiting for generation...');

  // Wait for result (up to 60s)
  let resultFound = false;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(3000);
    console.log(`Waiting... ${(i+1)*3}s`);
    await page.screenshot({ path: `/tmp/copainter_screenshots/g${index+1}_waiting_${i}.png` });

    // Check for generated image
    const hasResult = await page.evaluate(() => {
      // Look for generated image in result area
      const imgs = Array.from(document.querySelectorAll('img[src*="blob:"], img[src*="http"]'));
      const resultImgs = imgs.filter(img => {
        const src = img.src;
        return src.includes('blob:') ||
               (src.includes('copainter') && src.includes('output')) ||
               (src.includes('copainter') && !src.includes('logo') && !src.includes('icon') && !src.includes('thumb'));
      });
      return resultImgs.length > 0 ? resultImgs[0].src : null;
    });

    if (hasResult) {
      console.log('Result found:', hasResult.substring(0, 100));
      resultFound = true;

      // Download the result
      const outputPath = path.join(OUTPUT_DIR, gen.outputName);
      if (hasResult.startsWith('blob:')) {
        // Handle blob URL by taking screenshot of just the image
        const imgElement = await page.$(`img[src="${hasResult}"]`);
        if (imgElement) {
          await imgElement.screenshot({ path: outputPath });
          console.log('Saved (screenshot):', outputPath);
        }
      } else {
        // Download via request
        try {
          const response = await page.request.get(hasResult);
          const buffer = await response.body();
          fs.writeFileSync(outputPath, buffer);
          console.log('Saved:', outputPath, `(${buffer.length} bytes)`);
        } catch (e) {
          console.error('Download error:', e.message);
          // Try screenshot approach
          await page.screenshot({ path: outputPath.replace('.png', '_screen.png'), fullPage: false });
        }
      }
      break;
    }

    // Check for error
    const errorText = await page.evaluate(() => {
      const errorEl = document.querySelector('[class*="error"]') || document.querySelector('[color="red"]');
      return errorEl?.textContent?.trim() || null;
    });
    if (errorText) {
      console.log('Error on page:', errorText);
      break;
    }

    // Check page text for clues
    const pageText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    if (pageText.includes('チケットが不足') || pageText.includes('チケットをご購入')) {
      console.log('OUT OF TICKETS!');
      break;
    }
  }

  if (!resultFound) {
    // Take final screenshot
    await page.screenshot({ path: `/tmp/copainter_screenshots/g${index+1}_timeout.png`, fullPage: true });
    console.log('Generation timeout or failed. Screenshot saved.');

    // Try to find any new images
    const allImgs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img')).map(img => img.src).filter(s => s.length > 0);
    });
    console.log('All images on page:', allImgs.slice(0, 10));
  }

  return resultFound;
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

    // Check ticket count first
    await page.goto('https://www.copainter.ai/ja/my/aiAssistant', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const ticketText = await page.evaluate(() => {
      // Find ticket count button text
      const btns = Array.from(document.querySelectorAll('button'));
      const ticketBtn = btns.find(b => b.textContent?.includes('Ticket') || b.textContent?.match(/^\d+$/));
      return ticketBtn?.textContent?.trim() || 'unknown';
    });
    console.log('Tickets:', ticketText);

    for (let i = 0; i < GENERATIONS.length; i++) {
      const success = await generateImage(page, GENERATIONS[i], i);
      results.push({ gen: GENERATIONS[i].outputName, success });
      if (!success) {
        console.log('Stopping due to failure');
        break;
      }
    }

    console.log('\n=== RESULTS ===');
    results.forEach(r => console.log(`${r.gen}: ${r.success ? 'SUCCESS' : 'FAILED'}`));

    // List output files
    const files = fs.readdirSync(OUTPUT_DIR);
    console.log('\nOutput files:', files);

  } catch (e) {
    console.error('Fatal error:', e.message);
    console.error(e.stack);
    try { await page.screenshot({ path: '/tmp/copainter_screenshots/fatal_error.png', fullPage: true }); } catch {}
  } finally {
    await browser.close();
  }
})();
