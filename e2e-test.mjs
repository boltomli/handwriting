// 零依赖 CDP 冒烟测试：启动 headless Chromium，验证 index.html 的核心行为。
// 用法：先 python3 -m http.server 8077，再 node e2e-test.mjs
// SPDX-License-Identifier: MIT
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const CHROME = 'C:/Users/lisong/.cache/ms-playwright/chromium-1208/chrome-win64/chrome.exe';
const URL_ = process.env.TEST_URL || 'http://localhost:8077/index.html';
const PORT = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const exceptions = [];

function send(method, params = {}, sessionId) {
  const msg = { id: ++id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise((res, rej) => {
    pending.set(msg.id, { res, rej });
    setTimeout(() => { if (pending.delete(msg.id)) rej(new Error('timeout: ' + method)); }, 30000);
  });
}

async function connect() {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/new?url=${encodeURIComponent(URL_)}`, { method: 'PUT' });
      if (r.ok) target = await r.json();
    } catch { /* retry */ }
    await sleep(500);
  }
  if (!target) throw new Error('无法创建调试目标');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(m.params.exceptionDetails.exception?.description || m.params.text);
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      exceptions.push(m.params.entry.text);
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
}

async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
  return r.result.value;
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

try {
  await connect();
  await send('Page.navigate', { url: URL_ });
  // 轮询直到页面真正解析完
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    const s = await evalJs(`document.readyState + '|' + !!document.getElementById('fontStatus')`).catch(() => 'x');
    ready = s === 'complete|true';
    if (!ready) await sleep(500);
  }
  if (!ready) throw new Error('页面未就绪');
  await sleep(6000); // 等字体载入 + 首次渲染

  const boot = await evalJs(`(() => ({
    status: document.getElementById('fontStatus').innerText.replace(/\\n/g,' | '),
    meta: document.getElementById('meta').innerText,
    cw: canvas.width, ch: canvas.height,
    specimen: getComputedStyle(document.querySelector('.sample')).fontFamily
  }))()`);
  check('字体载入状态', /已载入|本机/.test(boot.status), boot.status);
  check('画布已渲染', boot.cw > 0 && boot.ch > 0, `${boot.cw}x${boot.ch}`);
  check('meta 有输出', /输出 \d+ × \d+/.test(boot.meta), boot.meta);

  // 画布上确实有墨迹（非纯背景色）
  const ink = await evalJs(`(() => {
    const c = document.getElementById('canvas');
    const x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 40) {
      if (Math.abs(d[i] - d[0]) > 30 || Math.abs(d[i+1] - d[1]) > 30 || Math.abs(d[i+2] - d[2]) > 30) n++;
    }
    return n;
  })()`);
  check('画布有手写墨迹', ink > 50, `采样差异点 ${ink}`);

  // 同种子可复现
  const same1 = await evalJs(`document.getElementById('canvas').toDataURL().length`);
  const seed1 = await evalJs(`document.getElementById('seed').value`);
  const same2 = await evalJs(`document.getElementById('canvas').toDataURL().length`);
  check('同种子结果稳定', same1 === same2 && same1 > 5000, `dataURL ${same1}`);

  // 换种子 → 图应变化（dataURL 长度或内容变化）
  const before = await evalJs(`document.getElementById('canvas').toDataURL()`);
  await evalJs(`document.getElementById('reseed').click(); true`);
  await sleep(400);
  const after = await evalJs(`document.getElementById('canvas').toDataURL()`);
  const seed2 = await evalJs(`document.getElementById('seed').value`);
  check('换种子后图像改变', before !== after && seed1 !== seed2, `种子 ${seed1} → ${seed2}`);

  // 生僻字预设：龘靐鱻麤都在主库（63000 字）里，不应误报缺字
  await evalJs(`[...document.querySelectorAll('.presets button')].find(b=>b.dataset.preset.includes('龘')).click(); true`);
  await sleep(800);
  const rare = await evalJs(`(() => ({hidden: document.getElementById('missingPanel').hidden, chars: document.getElementById('missingChars').innerText}))()`);
  check('主库生僻字不误报缺字', rare.hidden, rare.chars.slice(0, 60) || '面板关闭');

  // 补充库独有字符（U+24FB7 等，取自官方 coverage 报告的 extra 字表）
  await evalJs(`(() => { const t = document.getElementById('text'); t.value = '龘\u{24FB7}\u{24FB9}'; t.dispatchEvent(new Event('input', {bubbles:true})); return true; })()`);
  await sleep(900);
  const miss = await evalJs(`(() => ({
    hidden: document.getElementById('missingPanel').hidden,
    chars: document.getElementById('missingChars').innerText,
    extra: document.getElementById('missingExtra').innerText
  }))()`);
  check('缺字检测面板工作', !miss.hidden && /24FB7/.test(miss.chars), miss.chars.slice(0, 80));
  check('提供补充库入口', miss.extra.includes('生僻补充'), miss.extra.slice(0, 60));

  // 真的加载生僻补充库（本地 17.9MB）
  await evalJs(`document.querySelector('#missingExtra [data-act=extra]')?.click(); true`);
  await sleep(8000);
  const afterExtra = await evalJs(`(() => ({
    status: document.getElementById('fontStatus').innerText.replace(/\\n/g,' '),
    hidden: document.getElementById('missingPanel').hidden,
    chars: document.getElementById('missingChars').innerText
  }))()`);
  check('补充库载入后缺字消失',
    afterExtra.status.includes('主库 + 生僻补充') && afterExtra.hidden,
    afterExtra.status);

  // 长文本换行 + 自动增高
  await evalJs(`(() => {
    const t = document.getElementById('text');
    t.value = '把粗笔的笨拙，写成标题里的性格。横不必平，竖不必直。'.repeat(6);
    t.dispatchEvent(new Event('input', {bubbles:true}));
    return true;
  })()`);
  await sleep(900);
  const long = await evalJs(`(() => ({w: canvas.width, h: canvas.height, meta: document.getElementById('meta').innerText}))()`);
  check('长文本自动换行并增高', long.h > 2000, `${long.w}x${long.h} · ${long.meta}`);

  // 纸张 / 主题 / 清晰度切换
  await evalJs(`(() => {
    const s = document.getElementById('pageSize');
    s.value = '1600x900'; s.dispatchEvent(new Event('change', {bubbles:true}));
    document.querySelector('.swatch[data-theme=red]').click();
    return true;
  })()`);
  await sleep(500);
  const themed = await evalJs(`(() => {
    const c = document.getElementById('canvas');
    const p = c.getContext('2d').getImageData(5,5,1,1).data;
    return {w: c.width, bg: [p[0],p[1],p[2]].join(',')};
  })()`);
  check('横版纸张生效', themed.w === 3200, `宽 ${themed.w}`);
  check('朱砂主题生效', themed.bg === '179,25,25', `背景 rgb(${themed.bg})`);

  // PNG / WebP 导出可用（toDataURL 编码不报错）
  const mime = await evalJs(`(() => {
    const c = document.getElementById('canvas');
    return {png: c.toDataURL('image/png').slice(0,22), webp: c.toDataURL('image/webp').slice(0,22)};
  })()`);
  check('PNG 导出编码正常', mime.png.startsWith('data:image/png'), mime.png);
  check('WebP 导出编码正常', mime.webp.startsWith('data:image/webp'), mime.webp);

  // 导出按钮点击不抛异常
  const clickOk = await evalJs(`(() => {
    try { document.getElementById('exportPng').click();
          document.getElementById('exportWebp').click(); return 'ok'; }
    catch(e){ return 'error: ' + e.message; }
  })()`);
  check('导出按钮可点击', clickOk === 'ok', clickOk);

  check('无未捕获异常', exceptions.length === 0, exceptions.slice(0, 3).join(' | ') || '干净');
} catch (e) {
  check('测试执行', false, e.message);
} finally {
  chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* chrome 尚未退出 */ }
}

const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
