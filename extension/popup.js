const $ = id => document.getElementById(id);
const send = type => chrome.runtime.sendMessage({ type });

async function refresh() {
  const { rec, steps = [], autoPdf = true } = await chrome.storage.local.get(['rec', 'steps', 'autoPdf']);
  const on = !!rec?.on;
  $('idle').hidden = on;
  $('live').hidden = !on;
  $('count').textContent = steps.length;
  $('pause').textContent = rec?.paused ? 'Resume recording' : 'Pause';
  $('open').hidden = on || !steps.length;
  $('autoPdf').checked = autoPdf;
}

$('start').onclick = async () => { await send('start'); window.close(); };
$('stop').onclick = async () => { await send('stop'); window.close(); };
$('pause').onclick = () => send('pause');
$('open').onclick = () => { chrome.tabs.create({ url: chrome.runtime.getURL('guide.html') }); window.close(); };
$('autoPdf').onchange = e => chrome.storage.local.set({ autoPdf: e.target.checked });
chrome.storage.onChanged.addListener(refresh);
refresh();
