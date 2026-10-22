const sleep = ms => new Promise(r => setTimeout(r, ms));
let queue = Promise.resolve(), lastCap = 0, lastStepAt = 0;
const enqueue = fn => (queue = queue.then(fn).catch(console.error));
const store = chrome.storage.local;

function badge(text) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
}

// Chrome limits captureVisibleTab to ~2 calls/second, so space them out.
async function capture(windowId) {
  await sleep(Math.max(0, lastCap + 600 - Date.now()));
  lastCap = Date.now();
  try { return await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 70 }); }
  catch (e) { return null; }
}

async function addStep(step, windowId) {
  const { rec } = await store.get('rec');
  if (!rec?.on || rec.paused) return 0;
  const img = await capture(windowId);
  const id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const { steps = [] } = await store.get('steps');
  steps.push({ id, ...step, hasImg: !!img });
  await store.set({ steps, ...(img ? { ['img:' + id]: img } : {}) });
  badge(String(steps.length));
  lastStepAt = Date.now();
  return steps.length;
}

const inject = tabId =>
  chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] }).catch(() => {});

async function start() {
  const all = await store.get(null);
  await store.remove(Object.keys(all).filter(k => k.startsWith('img:')));
  await store.set({ rec: { on: true, paused: false }, steps: [], guideTitle: '' });
  badge('0');
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return;
  await inject(tab.id);
  let host = tab.url;
  try { host = new URL(tab.url).hostname || tab.url; } catch (e) {}
  enqueue(() => addStep({ type: 'open', text: 'Go to ' + host, pageTitle: tab.title || '', url: tab.url }, tab.windowId));
}

async function togglePause() {
  const { rec, steps = [] } = await store.get(['rec', 'steps']);
  if (!rec?.on) return;
  rec.paused = !rec.paused;
  await store.set({ rec });
  badge(rec.paused ? 'II' : String(steps.length));
}

async function stop() {
  await store.set({ rec: { on: false } });
  badge('');
  await queue; // let pending screenshots finish
  const { autoPdf = true } = await store.get('autoPdf');
  chrome.tabs.create({ url: chrome.runtime.getURL('guide.html') + (autoPdf ? '#auto' : '') });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'step' && sender.tab) { enqueue(async () => reply(await addStep(msg.step, sender.tab.windowId))); return true; }
  const cmd = { start, pause: togglePause, stop }[msg.type];
  if (cmd) { cmd().then(() => reply(), () => reply()); return true; }
});

// Make sure tabs that were already open get the recorder when you switch to them.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const { rec } = await store.get('rec');
  if (rec?.on) inject(tabId);
});

// Typed URLs, bookmarks, etc.: record a "Go to" step when a page loads and no step was just captured.
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete' || !tab.active || !/^https?:/.test(tab.url || '')) return;
  const { rec } = await store.get('rec');
  if (!rec?.on || rec.paused || Date.now() - lastStepAt < 4000) return;
  let host = tab.url;
  try { host = new URL(tab.url).hostname; } catch (e) {}
  enqueue(() => addStep({ type: 'open', text: 'Go to ' + host, pageTitle: tab.title || '', url: tab.url }, tab.windowId));
});
