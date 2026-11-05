// Property Inspector: shows what the plugin detected and offers to look again. It sends no path and saves nothing.
// The SDK logs every message, so nothing is written to the console.
for (const method of ['log', 'info', 'debug', 'warn', 'error']) console[method] = () => {};

const BUSY_TEXT = 'Detectando…';
const IDLE_TEXT = 'Detectar novamente';
// Discovery takes about half a second, and a query is bounded by the adapter's timeout. If no answer came by
// then, the button comes back so the panel never stays stuck.
const GIVE_UP_MS = 20_000;

const statusLine = document.querySelector('#status');
const retryButton = document.querySelector('#retry');
let giveUp = null;

function setBusy(busy) {
  retryButton.disabled = busy;
  retryButton.textContent = busy ? BUSY_TEXT : IDLE_TEXT;
  retryButton.setAttribute('aria-busy', String(busy));
  clearTimeout(giveUp);
  if (busy) giveUp = setTimeout(() => setBusy(false), GIVE_UP_MS);
}

$UD.connect();

$UD.onConnected(() => {
  $UD.sendToPlugin({ type: 'hello' });
});

$UD.onSendToPropertyInspector((jsn) => {
  const message = jsn.payload;
  if (message?.type !== 'status') return;
  statusLine.textContent = message.message;
  statusLine.dataset.state = message.state ?? '';
  setBusy(false);
});

retryButton.addEventListener('click', () => {
  setBusy(true);
  statusLine.textContent = 'Detectando o Wallpaper Engine…';
  statusLine.dataset.state = 'detecting';
  $UD.sendToPlugin({ type: 'retry' });
});
