require('dotenv').config();
const { chromium } = require('playwright');
const https = require('https');
const os = require('os');
const path = require('path');

// Try multiple temp email services
async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function getTempEmailMailtm() {
  // mail.tm - modern temp email service with REST API
  const domain = await fetchJson('https://api.mail.tm/domains?page=1');
  console.log('Domains:', JSON.stringify(domain));
  // Handle both array and hydra:member format
  const domainList = Array.isArray(domain) ? domain : domain['hydra:member'];
  const domainName = domainList[0].domain;

  const random = Math.random().toString(36).substring(2, 10);
  const email = `${random}@${domainName}`;
  const password = 'TestPass2026!';

  // Create account
  const createRes = await new Promise((resolve, reject) => {
    const body = JSON.stringify({ address: email, password });
    const req = https.request({
      hostname: 'api.mail.tm',
      path: '/accounts',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
  console.log('Create account result:', JSON.stringify(createRes));

  // Get token
  const tokenRes = await new Promise((resolve, reject) => {
    const body = JSON.stringify({ address: email, password });
    const req = https.request({
      hostname: 'api.mail.tm',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
  console.log('Token result:', JSON.stringify(tokenRes));

  return { email, password, token: tokenRes.token, accountId: createRes.id };
}

async function waitForEmailMailtm(token, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    console.log(`Checking inbox (attempt ${i + 1}/${maxAttempts})...`);
    await new Promise(r => setTimeout(r, 4000));

    const messages = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.mail.tm',
        path: '/messages',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(data.substring(0, 200))); }
        });
      });
      req.on('error', reject);
      req.end();
    });

    if (messages['hydra:totalItems'] > 0) {
      const msgId = messages['hydra:member'][0]['@id'].split('/').pop();
      const msg = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.mail.tm',
          path: `/messages/${msgId}`,
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(data.substring(0, 200))); }
          });
        });
        req.on('error', reject);
        req.end();
      });
      return msg;
    }
  }
  throw new Error('No verification email received within timeout');
}

(async () => {
  console.log('Creating temp email account...');
  let tempAccount;
  try {
    tempAccount = await getTempEmailMailtm();
    console.log('Temp email:', tempAccount.email);
  } catch (e) {
    console.error('Failed to create temp email:', e.message);
    process.exit(1);
  }

  const { email: tempEmail, password: tempPassword, token } = tempAccount;
  const copainterPassword = process.env.COPAINTER_PASSWORD;
  if (!copainterPassword) {
    console.error('Error: COPAINTER_PASSWORD not set in .env');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    console.log('Navigating to signup...');
    await page.goto('https://www.copainter.ai/ja/auth/signup', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    const emailBtn = await page.$('text=Eメールで新規登録');
    await emailBtn.click();
    await page.waitForTimeout(1500);

    await page.fill('#email', tempEmail);
    await page.fill('#password', copainterPassword);
    console.log('Filled form with:', tempEmail);

    await page.screenshot({ path: '/tmp/copainter_screenshots/09_filled_form.png' });

    // Submit
    const submitBtn = await page.$('button[type="submit"]:last-of-type');
    await page.click('button[type="submit"]:last-of-type');
    await page.waitForTimeout(4000);

    await page.screenshot({ path: '/tmp/copainter_screenshots/10_after_submit.png', fullPage: true });
    console.log('After submit URL:', page.url());
    const afterText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('After submit text:', afterText);

    // Check for email verification
    if (afterText.includes('メール') || afterText.includes('確認') || page.url().includes('verify')) {
      console.log('Email verification required, checking inbox...');
      try {
        const verifyEmail = await waitForEmailMailtm(token);
        console.log('Got email:', verifyEmail.subject);
        const body = verifyEmail.text || verifyEmail.html || '';
        console.log('Body preview:', body.substring(0, 500));

        const linkMatch = body.match(/https?:\/\/[^\s"<>)]+/g);
        if (linkMatch) {
          const verifyLink = linkMatch.find(l => l.includes('copainter') && (l.includes('verify') || l.includes('confirm') || l.includes('auth')));
          console.log('Verify link:', verifyLink);
          if (verifyLink) {
            await page.goto(verifyLink, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(2000);
            await page.screenshot({ path: '/tmp/copainter_screenshots/11_after_verify.png', fullPage: true });
            console.log('After verify URL:', page.url());
          }
        }
      } catch (e) {
        console.log('Email check failed:', e.message);
      }
    } else {
      console.log('Registration successful or already logged in');
    }

    await page.screenshot({ path: '/tmp/copainter_screenshots/12_final_state.png', fullPage: true });
    console.log('Final URL:', page.url());
    console.log('Final text:', await page.evaluate(() => document.body.innerText.substring(0, 1000)));

    const fs = require('fs');
    const credsDir = path.join(os.homedir(), '.config', 'copainter');
    const credsPath = path.join(credsDir, 'creds.json');
    fs.mkdirSync(credsDir, { recursive: true });
    fs.writeFileSync(credsPath, JSON.stringify({ email: tempEmail, password: copainterPassword }));
    fs.chmodSync(credsPath, 0o600);
    console.log(`Credentials saved to ${credsPath}`);

  } catch (e) {
    console.error('Error:', e.message);
    try { await page.screenshot({ path: '/tmp/copainter_screenshots/error_register.png' }); } catch {}
  } finally {
    await browser.close();
  }
})();
