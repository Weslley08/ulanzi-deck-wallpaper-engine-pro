// Property Inspector: shows what the plugin detected and offers to look again. It sends no path and saves nothing.
// The SDK logs every message, so nothing is written to the console.
for (const method of ['log', 'info', 'debug', 'warn', 'error']) console[method] = () => {};

const statusLine = document.querySelector('#status');
const retryButton = document.querySelector('#retry');

$UD.connect();

$UD.onConnected(() => {
  $UD.sendToPlugin({ type: 'hello' });
});

$UD.onSendToPropertyInspector((jsn) => {
  const message = jsn.payload;
  if (message?.type !== 'status') return;
  statusLine.textContent = message.message;
  retryButton.disabled = false;
});

retryButton.addEventListener('click', () => {
  retryButton.disabled = true;
  statusLine.textContent = 'Detectando o Wallpaper Engine…';
  $UD.sendToPlugin({ type: 'retry' });
});
