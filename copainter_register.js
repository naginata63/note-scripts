require('dotenv').config();
const { chromium } = require('playwright');
const https = require('https');
const os = require('os');
const path = require('path');

// 1secmail temp email API
async function getTempEmail() {
  return new Promise((resolve, reject) => {
    const req = https.get('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const emails = JSON.parse(data);
          resolve(emails[0]);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => reject(new Error('Timeout')));
  });
}

async function getEmails(login, domain) {
  return new Promise((resolve, reject) => {
    const url = `https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`;
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => reject(new Error('Timeout')));
  });
}

async function getEmailContent(login, domain, id) {
  return new Promise((resolve, reject) => {
    const url = `https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${id}`;
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => reject(new Error('Timeout')));
  });
}

async function waitForVerificationEmail(login, domain, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    console.log(`Waiting for email (attempt ${i + 1}/${maxAttempts})...`);
    await new Promise(r => setTimeout(r, 3000));
    const emails = await getEmails(login, domain);
    if (emails.length > 0) {
      console.log('Got emails:', JSON.stringify(emails));
      const email = await getEmailContent(login, domain, emails[0].id);
      return email;
    }
  }
  throw new Error('No verification email received');
}

(async () => {
  // Get temp email
  console.log('Getting temporary email...');
  const tempEmail = await getTempEmail();
  console.log('Temp email:', tempEmail);
  const [login, domain] = tempEmail.split('@');

  const password = process.env.COPAINTER_PASSWORD;
  if (!password) {
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
    // Navigate to signup
    console.log('Navigating to signup...');
    await page.goto('https://www.copainter.ai/ja/auth/signup', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Click email signup
    const emailBtn = await page.$('text=Eメールで新規登録');
    await emailBtn.click();
    await page.waitForTimeout(1500);

    // Fill in email and password
    await page.fill('#email', tempEmail);
    await page.fill('#password', password);
    await page.screenshot({ path: '/tmp/copainter_screenshots/09_filled_form.png' });
    console.log('Filled form. Email:', tempEmail, 'Password:', password);

    // Submit
    const submitBtn = await page.$('button[type="submit"]:has-text("ユーザー登録")');
    if (!submitBtn) {
      // Try any submit button
      const allSubmits = await page.$$('button[type="submit"]');
      console.log('Submit buttons found:', allSubmits.length);
      if (allSubmits.length > 0) {
        await allSubmits[allSubmits.length - 1].click();
      }
    } else {
      await submitBtn.click();
    }

    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/copainter_screenshots/10_after_submit.png', fullPage: true });
    console.log('After submit URL:', page.url());
    console.log('After submit text:', await page.evaluate(() => document.body.innerText.substring(0, 1000)));

    // Check if email verification needed
    const currentText = await page.evaluate(() => document.body.innerText);
    if (currentText.includes('メール') || currentText.includes('確認') || currentText.includes('verify')) {
      console.log('Email verification required!');

      // Wait for verification email
      const email = await waitForVerificationEmail(login, domain);
      console.log('Verification email received!');
      console.log('Subject:', email.subject);

      // Extract verification link
      const bodyText = email.body || email.htmlBody || '';
      console.log('Email body preview:', bodyText.substring(0, 500));

      const linkMatch = bodyText.match(/https:\/\/[^\s"<>]+/g);
      if (linkMatch) {
        console.log('Links found:', linkMatch.slice(0, 5));
        const verifyLink = linkMatch.find(l => l.includes('copainter') || l.includes('verify') || l.includes('confirm'));
        if (verifyLink) {
          console.log('Clicking verification link:', verifyLink);
          await page.goto(verifyLink, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(2000);
          await page.screenshot({ path: '/tmp/copainter_screenshots/11_after_verify.png', fullPage: true });
          console.log('After verify URL:', page.url());
        }
      }
    } else {
      console.log('No email verification needed OR already logged in!');
    }

    // Check current state
    await page.screenshot({ path: '/tmp/copainter_screenshots/12_final_state.png', fullPage: true });
    console.log('Final URL:', page.url());
    console.log('Final text:', await page.evaluate(() => document.body.innerText.substring(0, 1000)));

    // Save credentials to file for next step
    const fs = require('fs');
    const credsDir = path.join(os.homedir(), '.config', 'copainter');
    const credsPath = path.join(credsDir, 'creds.json');
    fs.mkdirSync(credsDir, { recursive: true });
    fs.writeFileSync(credsPath, JSON.stringify({ email: tempEmail, password }));
    fs.chmodSync(credsPath, 0o600);
    console.log(`Credentials saved to ${credsPath}`);

  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
    try { await page.screenshot({ path: '/tmp/copainter_screenshots/error_register.png' }); } catch {}
  } finally {
    await browser.close();
  }
})();
