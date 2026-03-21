require('dotenv').config();
const { chromium } = require('playwright');
const https = require('https');
const os = require('os');
const path = require('path');

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${data.substring(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function postJson(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function getAuthJson(hostname, path, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  // Create temp email via mail.tm
  console.log('Setting up temp email...');
  const domains = await fetchJson('https://api.mail.tm/domains?page=1');
  const domainList = Array.isArray(domains) ? domains : domains['hydra:member'];
  const domainName = domainList[0].domain;
  const random = Math.random().toString(36).substring(2, 10);
  const tempEmail = `${random}@${domainName}`;
  const mailPassword = 'TempMail2026!';

  const acct = await postJson('api.mail.tm', '/accounts', { address: tempEmail, password: mailPassword });
  const tok = await postJson('api.mail.tm', '/token', { address: tempEmail, password: mailPassword });
  const mailToken = tok.token;
  console.log('Temp email ready:', tempEmail);

  const copainterPass = process.env.COPAINTER_PASSWORD;
  if (!copainterPass) {
    console.error('Error: COPAINTER_PASSWORD not set in .env');
    process.exit(1);
  }
  const creds = { email: tempEmail, password: copainterPass, mailToken };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    console.log('Going to signup page...');
    await page.goto('https://www.copainter.ai/ja/auth/signup', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/copainter_screenshots/s1_signup.png' });

    // Click email signup button
    await page.getByText('Eメールで新規登録').click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/copainter_screenshots/s2_email_form.png' });

    // Fill form
    await page.fill('input[type="email"]', tempEmail);
    await page.fill('input[type="password"]', copainterPass);
    console.log('Form filled with:', tempEmail);
    await page.screenshot({ path: '/tmp/copainter_screenshots/s3_filled.png' });

    // Click submit
    await page.getByText('ユーザー登録').click();
    console.log('Clicked submit');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/copainter_screenshots/s4_after_submit.png', fullPage: true });

    const url4 = page.url();
    const text4 = await page.evaluate(() => document.body.innerText.substring(0, 1000));
    console.log('URL after submit:', url4);
    console.log('Text after submit:', text4);

    // Check for email verification
    if (text4.includes('メール') && text4.includes('送信')) {
      console.log('Verification email sent, checking inbox...');
      let verifyMsg = null;
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 4000));
        console.log(`Inbox check ${i+1}/15...`);
        const msgs = await getAuthJson('api.mail.tm', '/messages', mailToken);
        const msgList = Array.isArray(msgs) ? msgs : (msgs['hydra:member'] || []);
        if (msgList.length > 0) {
          const msgId = msgList[0]['@id'].split('/').pop() || msgList[0].id;
          verifyMsg = await getAuthJson('api.mail.tm', `/messages/${msgId}`, mailToken);
          console.log('Got email! Subject:', verifyMsg.subject);
          break;
        }
      }

      if (verifyMsg) {
        const body = verifyMsg.text || verifyMsg.html || '';
        const links = body.match(/https?:\/\/[^\s"<>)]+/g) || [];
        console.log('Links in email:', links.slice(0, 5));
        const verifyLink = links.find(l => l.includes('copainter'));
        if (verifyLink) {
          console.log('Visiting verify link:', verifyLink);
          await page.goto(verifyLink, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(2000);
          await page.screenshot({ path: '/tmp/copainter_screenshots/s5_verified.png', fullPage: true });
          console.log('Verified URL:', page.url());
        }
      } else {
        console.log('No verification email received');
      }
    }

    // Save creds
    const fs = require('fs');
    const credsDir = path.join(os.homedir(), '.config', 'copainter');
    const credsPath = path.join(credsDir, 'creds.json');
    fs.mkdirSync(credsDir, { recursive: true });
    fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2));
    fs.chmodSync(credsPath, 0o600);
    console.log('=== FINAL STATE ===');
    console.log('URL:', page.url());
    console.log(`Creds saved to ${credsPath}`);

  } catch (e) {
    console.error('Registration error:', e.message);
    try { await page.screenshot({ path: '/tmp/copainter_screenshots/err_register.png' }); } catch {}
  } finally {
    await browser.close();
  }
})();
