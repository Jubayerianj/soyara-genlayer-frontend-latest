#!/usr/bin/env node
//
// /ai?net=studio-next in a real browser engine, end to end.
//
//   npm i --no-save puppeteer-core
//   BASE=https://app.soyara.xyz node scripts/studio-next-ui.mjs
//
// A test wallet is injected as window.ethereum. It starts on Bradbury, has
// never seen Studio Next, and signs with a throwaway key, so the page goes
// through the same connect, add-network, sign and track steps a MetaMask user
// does: faucet, a consensus swap, a mandate, an agent trade with no signature,
// and a trade too large for the mandate staying with the user. Screenshots go
// to $SHOTS (default: the OS temp directory). Opens real rounds on Studio Next.

const { default: puppeteer } = await import('puppeteer-core').catch(() => {
  console.error('puppeteer-core is not installed: npm i --no-save puppeteer-core');
  process.exit(2);
});
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = (process.env.SHOTS || mkdtempSync(join(tmpdir(), 'studio-next-ui-'))) + '/';
mkdirSync(OUT, { recursive: true });

const RPCS = { 4221: 'https://rpc-bradbury.genlayer.com', 61997: 'https://studio-dev.genlayer.com/api' };
const account = privateKeyToAccount(process.env.PK || generatePrivateKey());
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const walletCalls = [];

async function rpc(chainId, method, params) {
  const res = await fetch(RPCS[chainId], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  userDataDir: mkdtempSync(join(tmpdir(), 'studio-next-profile-')),
  args: ['--no-first-run', '--no-default-browser-check', '--window-size=1440,1000'],
  defaultViewport: { width: 1440, height: 1000 },
});
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 300)}`));

await page.exposeFunction('__walletRequest', async (method, params, chainHex) => {
  const chainId = parseInt(chainHex, 16);
  walletCalls.push(`${method}@${chainId}`);
  if (method === 'eth_sendTransaction') {
    const tx = params[0];
    if (tx.chainId && parseInt(tx.chainId, 16) !== chainId) throw new Error(`tx chainId ${tx.chainId} does not match wallet chain ${chainHex}`);
    const nonce = tx.nonce ?? await rpc(chainId, 'eth_getTransactionCount', [account.address, 'pending']);
    const gas = tx.gas ?? await rpc(chainId, 'eth_estimateGas', [tx]);
    const gasPrice = tx.gasPrice ?? await rpc(chainId, 'eth_gasPrice', []);
    const signed = await account.signTransaction({
      chainId, type: 'legacy', to: tx.to, data: tx.data, value: BigInt(tx.value || 0),
      nonce: Number(BigInt(nonce)), gas: BigInt(gas), gasPrice: BigInt(gasPrice),
    });
    return rpc(chainId, 'eth_sendRawTransaction', [signed]);
  }
  if (method === 'personal_sign') return account.signMessage({ message: { raw: params[0] } });
  return rpc(chainId, method, params);
});

await page.evaluateOnNewDocument((address) => {
  const listeners = {};
  let chainId = '0x107d';
  const added = new Set(['0x107d']);
  const emit = (ev, v) => (listeners[ev] || []).forEach((fn) => { try { fn(v); } catch {} });
  const provider = {
    isMetaMask: true,
    async request({ method, params }) {
      if (method === 'eth_chainId') return chainId;
      if (method === 'net_version') return String(parseInt(chainId, 16));
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
      if (method === 'wallet_requestPermissions' || method === 'wallet_getPermissions') return [{ parentCapability: 'eth_accounts' }];
      if (method === 'wallet_switchEthereumChain') {
        const id = String(params[0].chainId).toLowerCase();
        if (!added.has(id)) { const e = new Error('Unrecognized chain ID'); e.code = 4902; throw e; }
        chainId = id; emit('chainChanged', id); return null;
      }
      if (method === 'wallet_addEthereumChain') {
        const id = String(params[0].chainId).toLowerCase();
        added.add(id); chainId = id; emit('chainChanged', id); return null;
      }
      return window.__walletRequest(method, params || [], chainId);
    },
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return provider; },
    removeListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); return provider; },
  };
  window.ethereum = provider;
}, account.address);

async function clickText(text, selector = 'button') {
  const ok = await page.evaluate((text, selector) => {
    const all = [...document.querySelectorAll(selector)].filter((el) => el.offsetParent !== null && !el.disabled);
    const exact = all.filter((el) => el.textContent.trim() === text);
    const els = exact.length ? exact : all.filter((el) => el.textContent.trim().includes(text));
    if (!els.length) return false;
    els[0].click();
    return true;
  }, text, selector);
  if (!ok) throw new Error(`no clickable "${text}"`);
}

async function waitText(re, timeout = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const body = await page.evaluate(() => document.body.innerText);
    const m = body.match(re);
    if (m) return m[0];
    await new Promise((r) => setTimeout(r, 500));
  }
  const body = await page.evaluate(() => document.body.innerText);
  throw new Error(`timed out waiting for ${re}\n---page---\n${body.slice(0, 2500)}`);
}

async function send(text) {
  await page.click('input[placeholder^="Swap 25 USDC"]');
  await page.type('input[placeholder^="Swap 25 USDC"]', text);
  await page.keyboard.press('Enter');
}

async function statusLine() {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => /StudioDesk_status/.test(d.className));
    return el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
  });
}

const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` });
let failures = 0;
const expect = (name, cond, detail = '') => { log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : `  ${detail}`}`); if (!cond) failures += 1; };

try {
  log('wallet', account.address);
  await page.goto(`${BASE}/ai?net=studio-next`, { waitUntil: 'networkidle2', timeout: 90_000 });
  await waitText(/Balances on Studio Next/i);
  const poolsLoaded = await page.evaluate(async () => {
    const d = [...document.querySelectorAll('details')].find((x) => x.innerText.includes('How to verify'));
    if (d) d.open = true;
    await new Promise((r) => setTimeout(r, 300));
    return /USDC\/USDT · 0\.99/.test(document.body.innerText);
  });
  expect('Studio Next desk renders with live pools', poolsLoaded);
  await shot('1-desk');

  const connected = await page.evaluate(() => /GEN for fees/.test(document.body.innerText));
  if (!connected) {
    await clickText('Connect Wallet');
    await new Promise((r) => setTimeout(r, 1200));
    await shot('2-modal');
    const walletNames = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean).slice(0, 30));
    const pick = walletNames.find((n) => /MetaMask|Browser Wallet|Injected/i.test(n));
    if (!pick) throw new Error(`no injected wallet option: ${walletNames.join(' | ')}`);
    await clickText(pick.split('\n')[0]);
  }
  await waitText(/GEN for fees/, 30_000);
  expect('wallet connected, desk shows the account', true);

  await clickText('Get test funds');
  const funded = await waitText(/Funded · 1,000 USDC[^\n]*|Faucet already used this hour[^\n]*/, 120_000);
  expect('faucet through the session agent', /Funded/.test(funded), funded);
  // No pause here on purpose: a swap asked for straight after funding once saw
  // the pre-funding balance and said "You hold 0 USDC".
  await shot('3-funded');

  await send('Swap 25 USDC to USDT');
  await waitText(/Press Swap to sign/);
  await shot('4-quote');
  await clickText('Swap', 'button');
  const swapped = await waitText(/(Settled · 25 USDC → [^\n]*|Not settled · [^\n]*|Could not send · [^\n]*|Wallet request declined[^\n]*)/, 150_000);
  expect('consensus swap signed in the wallet and settled', /^Settled/.test(swapped), swapped);
  expect('wallet was asked to add Studio Next, then signed there',
    walletCalls.includes('eth_sendTransaction@61997'), walletCalls.filter((c) => /wallet_|send/.test(c)).join(', '));
  await shot('5-settled');

  await send('Let my agent swap up to 60 USDC into USDT, 20 per trade, for an hour');
  await waitText(/Press Grant to sign/);
  await shot('6-mandate');
  await clickText('Grant');
  const granted = await waitText(/(Mandate live · [^\n]*|Not granted · [^\n]*|Could not send · [^\n]*)/, 150_000);
  expect('mandate granted by validators', /^Mandate live/.test(granted), granted);
  await new Promise((r) => setTimeout(r, 3000));

  const sendsBefore = walletCalls.filter((c) => c.startsWith('eth_sendTransaction')).length;
  await send('Swap 10 USDC to USDT');
  const agentSwap = await waitText(/(Settled · 10 USDC → [^\n]*|Not settled · [^\n]*)/, 120_000);
  const sendsAfter = walletCalls.filter((c) => c.startsWith('eth_sendTransaction')).length;
  expect('agent settled under the mandate', /^Settled/.test(agentSwap), agentSwap);
  expect('with no wallet signature', sendsAfter === sendsBefore, `${sendsBefore} -> ${sendsAfter}`);
  await new Promise((r) => setTimeout(r, 3000));
  await shot('7-agent');

  const cleared = await page.evaluate(() => !/Run again/.test(document.body.innerText));
  expect('a settled trade leaves no armed button behind', cleared);

  await send('Swap 30 USDC to USDT');
  await waitText(/Quote · 30 USDC[^\n]*/, 60_000);
  const card = await page.evaluate(() => document.body.innerText);
  expect('a trade over the mandate cap is not given to the agent',
    /consensus · you sign/i.test(card) && !/agent · no popup/i.test(card), card.slice(0, 400));

  log('status line:', await statusLine());

  // ── the swarm page on Studio Next ─────────────────────────────────────────
  // Same wallet and the mandate granted above (60 USDC, 20 per trade, 10 spent).
  await page.goto(`${BASE}/a2a/user?net=studio-next`, { waitUntil: 'networkidle2', timeout: 90_000 });
  await waitText(/Swarm on Studio Next/, 60_000);
  expect('the swarm page opens on Studio Next', /Studio Next/.test(await page.evaluate(() => document.body.innerText)));
  const runSwarm = async (text) => {
    await page.click('#studio-swarm-intent');
    await page.type('#studio-swarm-intent', text);
    await page.keyboard.press('Enter');
  };

  const sendsBeforeSwarm = walletCalls.filter((c) => c.startsWith('eth_sendTransaction')).length;
  await runSwarm('Swap 5 USDC to USDT');
  await waitText(/All agents agree\. Execute settles it with your agent/, 90_000);
  await clickText('Execute with your agent');
  const laneLine = await waitText(/(✓ Settled · 5 USDC → [^\n]*|Not settled · [^\n]*|Could not send · [^\n]*)/, 120_000);
  await waitText(/Receipt: [^\n]*/, 30_000);
  expect('swarm: the agent settles a covered trade', /^✓ Settled/.test(laneLine), laneLine);
  expect('swarm: with no wallet signature', walletCalls.filter((c) => c.startsWith('eth_sendTransaction')).length === sendsBeforeSwarm);
  const receipt = await waitText(/Receipt: [^\n]*/, 5_000);
  expect('swarm: the auditor confirms the receipt', /minimum honoured/.test(receipt) && /balances moved exactly/.test(receipt), receipt);
  await shot('8-swarm-agent');

  await runSwarm('Swap 400 USDC to ETH');
  await waitText(/Stopped here\. Nothing was sent/, 90_000);
  const stopped = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Stopped' && b.disabled));
  expect('swarm: an order over 10% of the market stops before signing', stopped);

  await runSwarm('Swap 25 USDC to USDT');
  await waitText(/All agents agree\. Execute to sign/, 90_000);
  await clickText('Execute');
  const ownLine = await waitText(/(✓ Settled · 25 USDC → [^\n]*|Not settled · [^\n]*|Could not send · [^\n]*|Wallet request declined[^\n]*)/, 150_000);
  expect('swarm: a trade over the mandate cap is signed and settled by consensus', /^✓ Settled/.test(ownLine), ownLine);
  expect('swarm: that one was signed in the wallet', walletCalls.filter((c) => c.startsWith('eth_sendTransaction')).length > sendsBeforeSwarm);
  const armed = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => /^Execute/.test(b.textContent.trim())));
  expect('swarm: nothing is left armed after it settles', !armed);
  await shot('9-swarm-consensus');
  log('screenshots:', OUT);
} catch (err) {
  failures += 1;
  log('ERROR', err.message);
  await shot('error').catch(() => {});
} finally {
  const relevant = consoleErrors.filter((e) => !/WalletConnect|walletconnect|Reown|Lit is in dev mode|favicon|preload|Download the React DevTools|cloud\.reown|pulse\.walletconnect/i.test(e));
  log(`console errors (${relevant.length}):`);
  relevant.slice(0, 15).forEach((e) => console.log('   ', e));
  await browser.close();
  log(failures ? `${failures} failed` : 'all passed');
  process.exit(failures ? 1 : 0);
}
