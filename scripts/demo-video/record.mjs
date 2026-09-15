// Soyara demo video: a scripted walk through every feature on app.soyara.xyz,
// recorded from a headless Chrome screencast, with narration and captions.
//
//   npm i --no-save puppeteer-core ffmpeg-static
//   node scripts/demo-video/record.mjs            full video (about 6 minutes to record)
//   node scripts/demo-video/record.mjs --test     intro and the first chapter only
//   node scripts/demo-video/compose.mjs           out/final.mp4 and out/final.srt
//
// macOS only: the voice is the system `say` command (Samantha), and Chrome is
// the installed app. Trades run for real on Studio Next from a throwaway demo
// wallet; its signature card is drawn on screen and labelled "Demo wallet".
// Leave a minute between runs: Studio Next allows 30 contract reads a minute.
//
// Writes out/raw.mp4 (1920x950, no audio) and out/timeline.json (when each
// narration line and chapter starts, in video seconds). compose.mjs mixes the
// voice and burns captions into a band below the app.

import puppeteer from 'puppeteer-core';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ffmpegPath from 'ffmpeg-static';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(HERE, 'out');
const VOICES = path.join(HERE, 'lines');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(VOICES, { recursive: true });

const TEST = process.argv.includes('--test');
const BASE = process.env.BASE || 'https://app.soyara.xyz';
const W = 1920;
const H = 950;
const FPS = 30;
const VOICE = 'Samantha';
const RATE = 172;
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── narration: caption as shown, and how the voice should say it ───────────
const LINES = [
  ['intro1', 'Soyara is an agentic DEX on GenLayer.', 'Soyara is an agentic dex on Gen Layer.'],
  ['intro2', 'AI agents trade for you, and GenLayer validators decide whether each trade is fair.', 'A.I. agents trade for you, and Gen Layer validators decide whether each trade is fair.'],
  ['intro3', 'Here is every feature, and how to use it.'],

  ['s1', 'Open AI Trading and switch the network to Studio Next, GenLayer’s Consensus v0.6 network.', 'Open A.I. Trading, and switch the network to Studio Next, Gen Layer’s consensus version zero point six network.'],
  ['s2', 'Studio Next has no EVM, so one Intelligent Contract, SoyaraAgentDex, holds the balances and pools, judges each trade and settles it.', 'Studio Next has no E.V.M., so one Intelligent Contract, Soyara Agent Dex, holds the balances and pools, judges each trade, and settles it.'],
  ['s3', 'Connect a wallet. The app adds the Studio Next network for you.'],
  ['s4', 'Type “get test funds”. Your agent key in this browser claims them, so there is nothing to sign.', 'Type, get test funds. Your agent key in this browser claims them, so there is nothing to sign.'],
  ['s5', 'You get 1,000 USDC, 1,000 USDT, 0.25 ETH and 2 WGEN, plus GEN for fees.', 'You get a thousand U.S.D.C., a thousand U.S.D.T., a quarter of an E.T.H., and two wrapped GEN, plus GEN for fees.'],

  ['c1', 'Ask for a trade in plain words. The contract quotes its own pool.'],
  ['c2', 'The card shows the price impact, your minimum, and the live Bradbury market it will be checked against.'],
  ['c3', 'Press Swap and sign once. Transaction Kit quotes a small deposit, refunded when the round is final.'],
  ['c4', 'Every validator now reads the live Soyara pool on Bradbury on its own. The trade settles only within your slippage of that price.'],
  ['c5', 'Settled, about 0.3% under the live price, pool fee included. The status line links the transaction.', 'Settled, about a third of a percent under the live price, pool fee included. The status line links the transaction.'],

  ['m1', 'To let your agent trade on its own, write its limits in your own words.'],
  ['m2', 'Sign once. Validators check the per-trade cap against the depth of the live market.'],
  ['m3', 'Each validator’s language model also checks that the caps are no looser than what you wrote.'],
  ['m4', 'The mandate is live, with its budget, per-trade cap and time left.'],

  ['a1', 'Now ask for a trade inside the mandate. Your agent settles it in seconds, with no wallet popup.'],
  ['a2', 'The contract still checks the budget, the cap, the expiry and the price band on every trade.'],
  ['a3', 'A trade over the per-trade cap never goes to the agent. It comes back to you to sign.'],

  ['r1', 'This order is more than 10% of the live Bradbury ETH market.', 'This order is more than ten percent of the live Bradbury E.T.H. market.'],
  ['r2', 'Sign it anyway, and the validators refuse it and store the reason. Nothing moves.'],
  ['r3', 'Refused: too large for the live market, and it tells you the most it will take.'],

  ['w1', 'The Trader Swarm puts seven agents on a trade before anything is signed. It remembers you chose Studio Next.'],
  ['w2', 'The router quotes the pool. The Market Analyst reads the Bradbury pool the validators will read.'],
  ['w3', 'The Settlement Strategist sees your mandate covers it. The auditor checks the pool is the canonical Bradbury pair.'],
  ['w4', 'Execute, and your agent settles it. The auditor confirms your balances moved exactly as the verdict says.'],
  ['w5', 'An order the validators would refuse is stopped here, before you sign anything.'],
  ['w6', 'Details shows the market read, the pre-flight checks, the contract call and every input the contract refuses.'],

  ['v1', 'Back on AI Trading, you can revoke the mandate at any time with one signature.', 'Back on A.I. Trading, you can revoke the mandate at any time, with one signature.'],
  ['v2', 'Your agent can no longer trade it.'],

  ['p1', 'Every trade and every refusal is a transaction on Studio Next.'],
  ['p2', 'The explorer shows its status, its fees, and how the validators voted.'],

  ['b1', 'Soyara is also a full DEX on GenLayer Bradbury. Swap routes every trade through the aggregator’s best path.', 'Soyara is also a full dex on Gen Layer Bradbury. Swap routes every trade through the aggregator’s best path.'],
  ['b2', 'Pools lists every market, and it is where liquidity is added and removed.'],
  ['b3', 'Portfolio shows your balances and positions.'],
  ['b4', 'On Bradbury, AI Trading settles through a Solidity AgentExecutor that only accepts verdicts and mandates the AgentValidator contract wrote.', 'On Bradbury, A.I. Trading settles through a Solidity Agent Executor that only accepts verdicts and mandates the Agent Validator contract wrote.'],
  ['b5', 'Agent Studio lets developers run the swarm under their own limits, and tamper with an order to watch settlement refuse it.'],
  ['b6', 'Build Agents documents the Soyara SDK, so your own agents can trade the same way.', 'Build Agents documents the Soyara S.D.K., so your own agents can trade the same way.'],
  ['b7', 'And Docs explains every part, including Studio Next.'],

  ['fc', 'A round usually takes ten to twenty seconds. The status line follows it.'],
  ['fm', 'Validators are voting. This round takes a little longer, because every validator also asks its own model.'],
  ['fr', 'A refusal is decided by consensus too, so it takes a normal round.'],
  ['fv', 'Revoking is a transaction as well, so it goes through a round.'],
  ['o1', 'Soyara. Agents trade, GenLayer decides.', 'Soyara. Agents trade. Gen Layer decides.'],
  ['o2', 'Try it at app.soyara.xyz', 'Try it at app dot soyara dot x y z.'],
];

function wavDuration(file) {
  const b = fs.readFileSync(file);
  let off = 12;
  let rate = 24000;
  let bytesPerSample = 2;
  let channels = 1;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      channels = b.readUInt16LE(off + 10);
      rate = b.readUInt32LE(off + 12);
      bytesPerSample = b.readUInt16LE(off + 22) / 8;
    }
    if (id === 'data') return size / (rate * bytesPerSample * channels);
    off += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${file}`);
}

const LINE = {};
for (const [id, cap, spoken] of LINES) {
  const file = path.join(VOICES, `${id}.wav`);
  execFileSync('say', ['-v', VOICE, '-r', String(RATE), '--file-format=WAVE', '--data-format=LEI16@24000', '-o', file, spoken || cap]);
  LINE[id] = { id, cap, file, duration: wavDuration(file) };
}
log(`voiced ${LINES.length} lines, ${Object.values(LINE).reduce((s, l) => s + l.duration, 0).toFixed(0)}s of speech`);

// ── the demo wallet ─────────────────────────────────────────────────────────
const RPCS = { 4221: 'https://rpc-bradbury.genlayer.com', 61997: 'https://studio-dev.genlayer.com/api' };
const account = privateKeyToAccount(generatePrivateKey());
const sends = [];
async function rpc(chainId, method, params) {
  const res = await fetch(RPCS[chainId], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'soyara-demo-')),
  args: ['--no-first-run', '--no-default-browser-check', `--window-size=${W},${H}`, '--hide-scrollbars'],
  defaultViewport: { width: W, height: H },
});
const page = await browser.newPage();
page.on('pageerror', (e) => log('pageerror', String(e.message).slice(0, 160)));

await page.exposeFunction('__walletRequest', async (method, params, chainHex) => {
  const chainId = parseInt(chainHex, 16);
  if (method === 'eth_sendTransaction') {
    const tx = params[0];
    const deposit = Number(BigInt(tx.value || 0)) / 1e18;
    await page.evaluate((d) => window.__demo?.wallet(d), deposit).catch(() => {});
    await sleep(1700);
    await page.evaluate(() => window.__demo?.walletConfirm()).catch(() => {});
    await sleep(600);
    const nonce = tx.nonce ?? await rpc(chainId, 'eth_getTransactionCount', [account.address, 'pending']);
    const gas = tx.gas ?? await rpc(chainId, 'eth_estimateGas', [tx]);
    const gasPrice = tx.gasPrice ?? await rpc(chainId, 'eth_gasPrice', []);
    const signed = await account.signTransaction({
      chainId, type: 'legacy', to: tx.to, data: tx.data, value: BigInt(tx.value || 0),
      nonce: Number(BigInt(nonce)), gas: BigInt(gas), gasPrice: BigInt(gasPrice),
    });
    sends.push(chainId);
    const hash = await rpc(chainId, 'eth_sendRawTransaction', [signed]);
    await page.evaluate(() => window.__demo?.walletHide()).catch(() => {});
    return hash;
  }
  if (method === 'personal_sign') return account.signMessage({ message: { raw: params[0] } });
  return rpc(chainId, method, params);
});

// Injected into every document: the wallet provider, a cursor, the wallet
// signature card, and the title cards.
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

  const css = `
    #demo-cursor { position: fixed; z-index: 2147483646; left: 0; top: 0; width: 26px; height: 26px; pointer-events: none;
      transform: translate(960px, 520px); transition: transform 600ms cubic-bezier(.3,.7,.2,1); filter: drop-shadow(0 2px 4px rgba(0,0,0,.5)); }
    #demo-ripple { position: fixed; z-index: 2147483645; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
      border: 2px solid #38bdf8; opacity: 0; pointer-events: none; }
    #demo-ripple.on { animation: demo-rip 520ms ease-out; }
    @keyframes demo-rip { from { opacity: .9; transform: scale(.4); } to { opacity: 0; transform: scale(1.8); } }
    #demo-wallet { position: fixed; z-index: 2147483644; top: 86px; right: 28px; width: 340px; border-radius: 16px;
      background: #0d141c; border: 1px solid #243140; box-shadow: 0 18px 50px rgba(0,0,0,.55); color: #e8eef5;
      font: 500 14px/1.45 Inter, -apple-system, 'Segoe UI', sans-serif; padding: 16px 18px; opacity: 0; transform: translateY(-8px);
      transition: opacity 180ms, transform 180ms; pointer-events: none; }
    #demo-wallet.on { opacity: 1; transform: none; }
    #demo-wallet .k { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #8c9bab; display: flex; justify-content: space-between; }
    #demo-wallet .t { font-size: 17px; font-weight: 700; margin: 6px 0 2px; }
    #demo-wallet .s { color: #b7c3cf; font-size: 13px; }
    #demo-wallet .row { display: flex; gap: 10px; margin-top: 14px; }
    #demo-wallet .b { flex: 1; text-align: center; padding: 9px 0; border-radius: 10px; font-weight: 700; font-size: 13px; }
    #demo-wallet .rej { background: #18222d; color: #b7c3cf; }
    #demo-wallet .ok { background: #0284c7; color: #fff; transition: background 160ms; }
    #demo-wallet.done .ok { background: #10b981; }
    #demo-card { position: fixed; inset: 0; z-index: 2147483643; background: radial-gradient(1200px 600px at 50% 40%, #0b1b2a 0%, #04070b 62%);
      display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 500ms; pointer-events: none; }
    #demo-card.on { opacity: 1; }
    #demo-card .in { max-width: 1100px; padding: 0 40px; text-align: center; color: #edf3f9; font-family: Inter, -apple-system, 'Segoe UI', sans-serif; }
    #demo-card img { display: block; width: 76px; height: 76px; border-radius: 20px; margin: 0 auto 26px; }
    #demo-card .kick { font-size: 18px; letter-spacing: .14em; text-transform: uppercase; color: #38bdf8; font-weight: 700; }
    #demo-card h1 { font-size: 64px; line-height: 1.08; margin: 14px 0 18px; font-weight: 800; letter-spacing: -.02em; }
    #demo-card p { font-size: 26px; line-height: 1.5; color: #b9c6d3; margin: 6px 0; }
  `;
  function ensure() {
    if (window.__demoReady || !document.body) return !!window.__demoReady;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l16 9.5-7 1.6L9.6 20z" fill="#fff" stroke="#04070b" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const ripple = document.createElement('div');
    ripple.id = 'demo-ripple';
    const wallet = document.createElement('div');
    wallet.id = 'demo-wallet';
    const card = document.createElement('div');
    card.id = 'demo-card';
    document.body.append(card, wallet, ripple, cursor);
    window.__demoReady = true;
    return true;
  }
  let pos = { x: 960, y: 520 };
  window.__demo = {
    cursorTo(x, y, ms = 600) {
      if (!ensure()) return;
      const c = document.getElementById('demo-cursor');
      c.style.transition = `transform ${ms}ms cubic-bezier(.3,.7,.2,1)`;
      c.style.transform = `translate(${x - 4}px, ${y - 2}px)`;
      pos = { x, y };
    },
    tap() {
      if (!ensure()) return;
      const r = document.getElementById('demo-ripple');
      r.style.left = `${pos.x}px`;
      r.style.top = `${pos.y}px`;
      r.classList.remove('on');
      void r.offsetWidth;
      r.classList.add('on');
    },
    wallet(deposit) {
      if (!ensure()) return;
      const w = document.getElementById('demo-wallet');
      const d = deposit > 0 ? `${deposit.toPrecision(3)} GEN deposit, refunded when final` : 'No value moved';
      w.innerHTML = `<div class="k"><span>Demo wallet</span><span>GenLayer Studio Next</span></div>
        <div class="t">Signature request</div><div class="s">A transaction to SoyaraAgentDex</div><div class="s">${d}</div>
        <div class="row"><div class="b rej">Reject</div><div class="b ok">Confirm</div></div>`;
      w.classList.remove('done');
      w.classList.add('on');
    },
    walletConfirm() {
      const w = document.getElementById('demo-wallet');
      if (!w) return;
      w.classList.add('done');
      w.querySelector('.ok').textContent = 'Signed';
    },
    walletHide() {
      const w = document.getElementById('demo-wallet');
      if (w) w.classList.remove('on');
    },
    card(on, { kick = '', title = '', lines = [] } = {}) {
      if (!ensure()) return;
      const c = document.getElementById('demo-card');
      if (on) {
        c.innerHTML = `<div class="in"><img src="/logo.png" alt=""/><div class="kick">${kick}</div><h1>${title}</h1>${lines.map((l) => `<p>${l}</p>`).join('')}</div>`;
        c.classList.add('on');
      } else {
        c.classList.remove('on');
      }
    },
  };
  document.addEventListener('DOMContentLoaded', ensure);
}, account.address);

// ── recorder: JPEG screencast frames piped into H.264 at a steady 30 fps ────
async function startRecorder(file) {
  const ff = spawn(ffmpegPath, ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', file], { stdio: ['pipe', 'ignore', 'pipe'] });
  ff.stderr.on('data', (d) => process.stderr.write(`[ffmpeg] ${d}`));
  const client = await page.createCDPSession();
  let start = null;
  let last = null;
  let written = 0;
  let chain = Promise.resolve();
  const write = (buf) => new Promise((res) => { if (ff.stdin.write(buf)) res(); else ff.stdin.once('drain', res); });
  const pump = async (upTo) => { while (last && written < upTo) { await write(last); written += 1; } };
  client.on('Page.screencastFrame', ({ data, sessionId }) => {
    client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    const now = Date.now();
    const buf = Buffer.from(data, 'base64');
    chain = chain.then(async () => {
      if (start === null) { start = now; last = buf; return; }
      await pump(Math.floor(((now - start) / 1000) * FPS));
      last = buf;
    });
  });
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  return {
    get start() { return start; },
    async stop() {
      const end = Date.now();
      await client.send('Page.stopScreencast').catch(() => {});
      await chain;
      await pump(Math.floor(((end - start) / 1000) * FPS) + 1);
      ff.stdin.end();
      await new Promise((r) => ff.on('close', r));
      return written / FPS;
    },
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────
let rec = null;
const timeline = { lines: [], chapters: [] };
const now = () => (Date.now() - rec.start) / 1000;
let speech = Promise.resolve();
let pending = 0;
let lastSpeechEnd = Date.now();
function say(id) {
  const line = LINE[id];
  pending += 1;
  const p = speech.then(async () => {
    timeline.lines.push({ id, cap: line.cap, file: line.file, start: now(), duration: line.duration });
    await sleep(line.duration * 1000 + 380);
    pending -= 1;
    lastSpeechEnd = Date.now();
  });
  speech = p;
  return p;
}
function chapter(title) {
  page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => {});
  timeline.chapters.push({ title, start: now() });
  log(`chapter: ${title}`);
}
async function bodyText() { return page.evaluate(() => document.body.innerText); }
async function waitText(re, timeout = 120_000, filler = null) {
  const until = Date.now() + timeout;
  let filled = false;
  while (Date.now() < until) {
    const m = (await bodyText()).match(re);
    if (m) return m[0];
    // A long on-chain wait gets one line of narration instead of dead air.
    if (filler && !filled && pending === 0 && Date.now() - lastSpeechEnd > 3500) {
      filled = true;
      say(filler);
    }
    await sleep(400);
  }
  throw new Error(`timed out waiting for ${re}`);
}
async function handleFor(text, selector = 'button, a, summary, [role=tab]', { exact = true, last = false } = {}) {
  const h = await page.evaluateHandle((text, selector, exact, last) => {
    const all = [...document.querySelectorAll(selector)].filter((el) => el.offsetParent !== null && !el.disabled
      && (exact ? el.textContent.trim() === text : el.textContent.trim().startsWith(text)));
    return (last ? all[all.length - 1] : all[0]) || null;
  }, text, selector, exact, last);
  const el = h.asElement();
  if (!el) throw new Error(`nothing to click: "${text}"`);
  return el;
}
async function point(el, { click = true } = {}) {
  // Scroll only when the target is off screen: centring everything scrolled the
  // desk away and put the footer in the shot.
  const inView = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return r.top >= 72 && r.bottom <= window.innerHeight - 8;
  });
  if (!inView) {
    await el.evaluate((node) => node.scrollIntoView({ block: 'nearest', behavior: 'instant' }));
    await sleep(160);
  }
  const box = await el.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate((x, y) => window.__demo.cursorTo(x, y, 650), x, y);
  await sleep(700);
  if (click) {
    await page.evaluate(() => window.__demo.tap());
    await page.mouse.click(x, y);
  }
}
// Wait for the target instead of assuming it rendered with the status line:
// lists refresh from a contract read that lands a moment after the verdict.
async function waitHandle(text, selector, opts = {}, timeout = 30_000) {
  const until = Date.now() + timeout;
  for (;;) {
    try { return await handleFor(text, selector, opts); } catch (err) {
      if (Date.now() > until) throw err;
      await sleep(400);
    }
  }
}
const clickText = async (text, selector, opts, timeout) => point(await waitHandle(text, selector, opts, timeout));
const hoverText = async (text, selector, opts) => {
  try { await point(await waitHandle(text, selector, opts, 12_000), { click: false }); } catch (err) { log('hover skipped:', err.message); }
};
async function typeInto(selector, text) {
  const el = await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
  await point(el);
  await page.type(selector, text, { delay: 34 });
}
async function goto(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await sleep(300);
}
const deskInput = 'input[placeholder^="Swap 25 USDC"]';

// ── the film ────────────────────────────────────────────────────────────────
try {
  await goto(`${BASE}/ai?net=bradbury`);
  await waitText(/AI Execution Proposal/, 90_000);
  await sleep(1500);
  await page.evaluate(() => window.__demo.card(true, {
    kick: 'GenLayer Agent Tank',
    title: 'Soyara',
    lines: ['Agent trading, judged by GenLayer consensus', 'Live on Studio Next, and a full DEX on Bradbury'],
  }));
  await sleep(800);

  rec = await startRecorder(path.join(OUT, 'raw.mp4'));
  await page.evaluate(() => window.__demo.cursorTo(1500, 700, 300));
  while (rec.start === null) await sleep(50);
  log('recording');

  await say('intro1');
  await say('intro2');
  await say('intro3');
  await page.evaluate(() => window.__demo.card(false));
  await sleep(700);

  // 1 · Getting started
  chapter('Getting started on Studio Next');
  const s1 = say('s1');
  await sleep(1200);
  await clickText('Studio Next', 'button');
  await waitText(/Balances on Studio Next/i, 60_000);
  await s1;
  say('s2');
  await sleep(2500);
  await hoverText('SoyaraAgentDex', 'a', { exact: false });
  await speech;
  const s3 = say('s3');
  await point(await page.waitForSelector('header button[class*="accountBtn"], header button:last-of-type'), { click: false }).catch(() => {});
  await s3;
  const s4 = say('s4');
  await typeInto(deskInput, 'Get test funds');
  await page.keyboard.press('Enter');
  await waitText(/Funded · 1,000 USDC/, 90_000);
  await s4;
  await say('s5');

  if (!TEST) {
    // 2 · A swap judged by consensus
    chapter('A swap judged by consensus');
    const c1 = say('c1');
    await typeInto(deskInput, 'Swap 25 USDC to USDT');
    await page.keyboard.press('Enter');
    await waitText(/Press Swap to sign/, 60_000);
    await c1;
    const c2 = say('c2');
    await clickText('Details', 'summary');
    await c2;
    const c3 = say('c3');
    await clickText('Swap', 'button');
    await waitText(/Validators reading the live Bradbury pool/, 60_000);
    await c3;
    say('c4');
    await waitText(/Settled · 25 USDC[^\n]*/, 150_000, 'fc');
    await speech;
    await say('c5');
    const swapTx = await page.evaluate(() => [...document.querySelectorAll('a[href*="/tx/"]')].map((a) => a.href).pop() || null);
    log('consensus swap tx', swapTx);

    // 3 · A mandate in your own words
    chapter('An agent mandate in your own words');
    const m1 = say('m1');
    await typeInto(deskInput, 'Let my agent swap up to 60 USDC into USDT, 20 per trade, for an hour');
    await page.keyboard.press('Enter');
    await waitText(/Press Grant to sign/, 60_000);
    await m1;
    say('m2');
    await clickText('Grant', 'button');
    say('m3');
    await waitText(/Mandate live[^\n]*/, 150_000, 'fm');
    await speech;
    const m4 = say('m4');
    await hoverText('Revoke', 'button');
    await m4;

    // 4 · The agent trades
    chapter('Your agent trades, no popup');
    const sendsBefore = sends.length;
    const a1 = say('a1');
    await typeInto(deskInput, 'Swap 10 USDC to USDT');
    await page.keyboard.press('Enter');
    await waitText(/Settled · 10 USDC[^\n]*/, 120_000);
    await a1;
    if (sends.length !== sendsBefore) log('WARNING: the agent trade asked the wallet to sign');
    await say('a2');
    const a3 = say('a3');
    await typeInto(deskInput, 'Swap 30 USDC to USDT');
    await page.keyboard.press('Enter');
    await waitText(/Quote · 30 USDC/, 60_000);
    await a3;

    // 5 · When validators say no
    chapter('When validators say no');
    const r1 = say('r1');
    await typeInto(deskInput, 'Swap 400 USDC to ETH');
    await page.keyboard.press('Enter');
    await waitText(/Quote · 400 USDC/, 60_000);
    await r1;
    say('r2');
    await clickText('Swap', 'button');
    await waitText(/Not settled · Too large[^\n]*/, 150_000, 'fr');
    await speech;
    await say('r3');

    // 6 · The Trader Swarm
    chapter('The Trader Swarm on Studio Next');
    const w1 = say('w1');
    await clickText('Swarm', 'header a');
    await waitText(/Trader Swarm/, 60_000);
    await clickText('Trader Swarm', 'a', { exact: false });
    await waitText(/Swarm on Studio Next/, 60_000);
    await w1;
    const w2 = say('w2');
    await typeInto('#studio-swarm-intent', 'Swap 5 USDC to USDT');
    await page.keyboard.press('Enter');
    say('w3');
    await waitText(/All agents agree\. Execute settles it with your agent/, 90_000);
    await w2;
    await speech;
    const w4 = say('w4');
    await clickText('Execute with your agent', 'button');
    await waitText(/Receipt: [^\n]*/, 120_000);
    await w4;
    const w5 = say('w5');
    await typeInto('#studio-swarm-intent', 'Swap 400 USDC to ETH');
    await page.keyboard.press('Enter');
    await waitText(/Stopped here\. Nothing was sent/, 90_000);
    await w5;
    const w6 = say('w6');
    await clickText('Details', 'summary', { last: true });
    await sleep(900);
    await page.evaluate(() => window.scrollBy({ top: 320, behavior: 'smooth' }));
    await w6;
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // 7 · Revoke
    chapter('Revoke the mandate');
    const v1 = say('v1');
    await clickText('AI Trading', 'header a');
    await waitText(/Balances on Studio Next/i, 60_000);
    await sleep(1500);
    await clickText('Revoke', 'button');
    await waitText(/Mandate revoked[^\n]*/, 150_000, 'fv');
    await v1;
    await say('v2');

    // 8 · Proof on chain
    chapter('Proof on chain');
    const p1 = say('p1');
    if (swapTx) {
      await goto(swapTx);
      await waitText(/Transaction Details/, 60_000).catch(() => log('explorer slow'));
    }
    await p1;
    const p2 = say('p2');
    await sleep(1200);
    await clickText('Consensus', 'button, [role=tab]').catch(() => log('no Consensus tab'));
    await sleep(1500);
    await page.evaluate(() => window.scrollBy({ top: 260, behavior: 'smooth' }));
    await p2;

    // 9 · The full DEX on Bradbury
    chapter('The full DEX on Bradbury');
    const b1 = say('b1');
    await goto(`${BASE}/swap`);
    await waitText(/YOU PAY/i, 60_000);
    try {
      // The token pickers read "Selected asset" plus the symbol, so they are
      // found by class, pay first and receive second.
      await page.waitForSelector('button[class*="tokenSelector"]', { visible: true, timeout: 15_000 });
      await point((await page.$$('button[class*="tokenSelector"]'))[0]);
      await typeInto('input[placeholder="Search name or paste address"]', 'USDC');
      await clickText('USDC', 'button[class*="tokenItem"]', { exact: false }, 6000);
      await sleep(700);
      await point((await page.$$('button[class*="tokenSelector"]'))[1]);
      await typeInto('input[placeholder="Search name or paste address"]', 'USDT');
      await clickText('USDT', 'button[class*="tokenItem"]', { exact: false }, 6000);
      await sleep(700);
      await typeInto('input[placeholder="0.0"]', '100');
      await sleep(3000);
    } catch (err) {
      log('swap tour step skipped:', err.message);
    }
    await b1;
    const b2 = say('b2');
    await goto(`${BASE}/pools`);
    await waitText(/Pool Markets/i, 60_000).catch(() => {});
    await sleep(1500);
    await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
    await b2;
    const b3 = say('b3');
    await goto(`${BASE}/portfolio`);
    await b3;
    const b4 = say('b4');
    await goto(`${BASE}/ai?net=bradbury`);
    await waitText(/AI Execution Proposal/, 60_000).catch(() => {});
    await b4;
    const b5 = say('b5');
    await goto(`${BASE}/a2a/dev`);
    await waitText(/Agent Studio/, 60_000).catch(() => {});
    await b5;
    const b6 = say('b6');
    await goto(`${BASE}/sdk`);
    await b6;
    const b7 = say('b7');
    await goto(`${BASE}/docs?topic=studio-next`);
    await waitText(/GenLayer Studio Next/, 60_000).catch(() => {});
    await sleep(1200);
    await page.evaluate(() => window.scrollBy({ top: 360, behavior: 'smooth' }));
    await b7;
  }

  // Outro
  chapter('');
  await page.evaluate(() => window.__demo.card(true, {
    kick: 'Soyara on GenLayer',
    title: 'Agents trade. GenLayer decides.',
    lines: ['app.soyara.xyz', 'github.com/Jubayerianj/soyara-genlayer-contracts'],
  }));
  await sleep(600);
  await say('o1');
  await say('o2');
  await sleep(1200);

  const duration = await rec.stop();
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ duration, ...timeline }, null, 2));
  log(`done: ${duration.toFixed(1)}s of video, ${timeline.lines.length} lines, ${sends.length} wallet signatures`);
} catch (err) {
  log('FAILED:', err.message);
  await page.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {});
  if (rec?.start) {
    const duration = await rec.stop().catch(() => 0);
    fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ duration, failed: err.message, ...timeline }, null, 2));
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
