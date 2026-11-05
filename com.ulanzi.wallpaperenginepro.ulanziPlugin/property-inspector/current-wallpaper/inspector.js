// Property Inspector: saves the Wallpaper Engine path through the plugin, which validates it.
// The SDK logs every message, and messages carry the path, so nothing is written to the console.
for (const method of ['log', 'info', 'debug', 'warn', 'error']) console[method] = () => {};

const input = document.querySelector('#executablePath');
const statusLine = document.querySelector('#status');

function showStatus(text, ok) {
  statusLine.textContent = text;
  statusLine.classList.toggle('error', ok === false);
}

$UD.connect();

$UD.onConnected(() => {
  $UD.sendToPlugin({ type: 'hello' });
});

$UD.onSendToPropertyInspector((jsn) => {
  const message = jsn.payload;
  if (message?.type === 'settings') {
    input.value = message.executablePath ?? '';
    if (!message.executablePath) showStatus('Enter the full path to wallpaper64.exe, then press Enter.');
  } else if (message?.type === 'status') {
    showStatus(message.message, message.ok);
  }
});

// change fires on Enter or when the field loses focus, so a path is not sent letter by letter.
input.addEventListener('change', () => {
  $UD.sendToPlugin({ type: 'save', executablePath: input.value });
});
