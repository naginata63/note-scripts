#!/usr/bin/env node
'use strict';
// Usage: node scripts/fetch_body.js <note_id>
const { chromium } = require('@playwright/test');
const USER_DATA_DIR = '/home/murakami/.cache/ms-playwright/note-cli-profile';

const noteId = process.argv[2];
if (!noteId) { console.error('Usage: node fetch_body.js <note_id>'); process.exit(1); }

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { headless: true });
  const page = await ctx.newPage();
  await page.goto('https://note.com', { waitUntil: 'networkidle', timeout: 30000 });
  const res = await page.evaluate(async (id) => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      const r = await fetch(`/api/v3/notes/${id}`, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
      clearTimeout(timer);
      return r.json();
    } catch(e) { return { error: e.message }; }
  }, noteId);
  if (res && res.data) {
    console.log('=== BODY ===');
    console.log(res.data.body || '(empty)');
    console.log('=== HASHTAGS ===');
    console.log(JSON.stringify(res.data.hashtag_notes || []));
    console.log('=== STATUS ===');
    console.log(res.data.status);
  } else {
    console.log(JSON.stringify(res));
  }
  await ctx.close();
})();
