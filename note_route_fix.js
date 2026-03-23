const { chromium } = require('@playwright/test');
(async () => {
  const ctx = await chromium.launchPersistentContext(
    '/home/murakami/.cache/ms-playwright/note-cli-profile',
    { headless: false, locale: 'ja-JP', viewport: { width: 1280, height: 800 } }
  );
  const page = await ctx.newPage();

  // Set up route interception BEFORE navigating
  let intercepted = false;
  await page.route('**/api/v1/text_notes/draft_save**', async (route) => {
    const req = route.request();
    const postData = req.postData();
    if (!postData || intercepted) {
      await route.continue();
      return;
    }

    console.log('\n>>> INTERCEPTING save request <<<');
    try {
      const bodyObj = JSON.parse(postData);
      let html = bodyObj.body;

      // Find the 02_menu_open figure (contains 1772771362)
      // NOTE: HTML正規表現は一般的に脆弱パターンだが、このスクリプトはローカル実行専用のため許容
      const menuOpenRegex = /<figure[^>]*>[\s\S]*?1772771362[\s\S]*?<\/figure>/;
      const menuOpenMatch = html.match(menuOpenRegex);

      if (!menuOpenMatch) {
        console.log('  02_menu_open figure not found, passing through');
        await route.continue();
        return;
      }

      const menuOpenFigure = menuOpenMatch[0];
      console.log('  Found 02_menu_open figure');

      // Check if already in correct position (after workflow 1772766346)
      const workflowPos = html.indexOf('1772766346');
      const menuPos = html.indexOf('1772771362');
      if (workflowPos > 0 && menuPos > workflowPos) {
        console.log('  Already in correct position, passing through');
        await route.continue();
        return;
      }

      // Remove from current position
      html = html.replace(menuOpenFigure, '');

      // Find workflow figure end（ローカル実行専用のためHTML正規表現を許容）
      const workflowRegex = /<figure[^>]*>[\s\S]*?1772766346[\s\S]*?<\/figure>/;
      const workflowMatch = html.match(workflowRegex);
      if (!workflowMatch) {
        console.log('  Workflow figure not found, passing through');
        await route.continue();
        return;
      }

      const workflowEnd = html.indexOf(workflowMatch[0]) + workflowMatch[0].length;

      // Check what comes after workflow figure - find the next element
      const afterWorkflow = html.substring(workflowEnd, workflowEnd + 200);
      console.log('  After workflow:', afterWorkflow.substring(0, 100));

      // Insert 02_menu_open after the empty paragraph that follows workflow
      // Look for the next <p> with <br> (empty paragraph) after workflow
      const emptyPAfterWorkflow = afterWorkflow.match(/<p[^>]*><br><\/p>/);
      let insertPos;
      if (emptyPAfterWorkflow) {
        // Insert after the empty paragraph
        insertPos = workflowEnd + afterWorkflow.indexOf(emptyPAfterWorkflow[0]) + emptyPAfterWorkflow[0].length;
      } else {
        // Insert right after workflow
        insertPos = workflowEnd;
      }

      html = html.substring(0, insertPos) + menuOpenFigure + html.substring(insertPos);

      bodyObj.body = html;
      intercepted = true;
      console.log('  Modified body, image moved to correct position');
      console.log('  New body length:', JSON.stringify(bodyObj).length);

      await route.continue({ postData: JSON.stringify(bodyObj) });
    } catch (e) {
      console.log('  Error modifying:', e.message);
      await route.continue();
    }
  });

  await page.goto('https://editor.note.com/notes/ncef792faac1f/edit/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  console.log('URL:', page.url());

  // Make a trivial edit to trigger autosave
  console.log('\n--- Triggering save ---');
  const clickTarget = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    for (const c of ch) {
      if (c.tagName === 'P' && c.textContent.includes('わたしはずっとそうでした')) {
        c.scrollIntoView({ block: 'center' });
        const r = c.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  });

  if (clickTarget) {
    await page.mouse.click(clickTarget.x, clickTarget.y);
    await page.waitForTimeout(300);
    await page.keyboard.press('End');
    await page.waitForTimeout(200);
    await page.keyboard.type(' ');
    await page.waitForTimeout(300);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);
  }

  // Wait for autosave to trigger
  console.log('Waiting for save (up to 60s)...');
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(5000);
    process.stdout.write('.');
    if (intercepted) {
      console.log('\nSave intercepted and modified!');
      break;
    }
  }

  if (!intercepted) {
    // Try Ctrl+S
    console.log('\nTrying Ctrl+S...');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(10000);
  }

  if (!intercepted) {
    console.log('WARNING: Save not intercepted. Trying more edits...');
    await page.keyboard.type('test');
    await page.waitForTimeout(500);
    for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);

    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(5000);
      process.stdout.write('.');
      if (intercepted) {
        console.log('\nSave intercepted!');
        break;
      }
    }
  }

  // Wait for response
  await page.waitForTimeout(5000);

  // Monitor response
  page.on('response', res => {
    if (res.url().includes('draft_save')) {
      console.log('Save response:', res.status());
    }
  });

  // Reload and verify
  console.log('\n--- Reloading to verify ---');
  await page.goto('https://editor.note.com/notes/ncef792faac1f/edit/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  console.log('\n=== VERIFICATION ===');
  const final = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    let imgN = 0;
    const result = [];
    for (let i = 0; i < ch.length; i++) {
      const img = ch[i].querySelector('img');
      const fc = ch[i].querySelector('figcaption');
      if (img) {
        imgN++;
        const prev = ch[i-1]?.textContent?.trim()?.substring(0, 60) || '';
        const next = ch[i+1]?.textContent?.trim()?.substring(0, 60) || '';
        const src = img.src.split('/').pop().substring(0, 30);
        result.push(`IMG#${imgN} [${i}] src=${src} cap=[${fc?.textContent?.trim()?.substring(0,50)||''}] prev=[${prev}] next=[${next}]`);
      }
    }
    const splitOk = !ch.some(c => c.textContent.includes('嬉しいです') && c.textContent.includes('メール返信に30分'));
    return { result, total: imgN, splitOk };
  });
  final.result.forEach(l => console.log('  ' + l));
  console.log('  Total:', final.total, '| Split OK:', final.splitOk);

  // Check correct position
  const menuOpenLine = final.result.find(r => r.includes('1772771362'));
  if (menuOpenLine) {
    const correctPos = menuOpenLine.includes('next=[30分が5分') || menuOpenLine.includes('prev=[') && menuOpenLine.includes('1772766346');
    console.log('  02_menu_open position correct:', correctPos);
  }

  await ctx.close();
})();
