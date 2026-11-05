// Property Inspector of a Wallpaper Command key. Studio keeps what it saves per key (sendParamFromPlugin),
// and sends it back on add and after a restart. The plugin validates everything again.
for (const method of ['log', 'info', 'debug', 'warn', 'error']) console[method] = () => {};

const KNOWN = ['next', 'pause', 'play', 'mute', 'unmute', 'playlist', 'profile'];
const NAMED = { playlist: 'Nome da playlist', profile: 'Nome do perfil' };
// From the Wallpaper Engine docs. Index 0 is Wallpaper Engine's first monitor, not necessarily the Windows primary.
const MONITOR_NOTES = {
  next: 'Vazio: troca o wallpaper de todos os monitores. Um número escolhe só aquele monitor, na numeração do Wallpaper Engine.',
  playlist: 'Vazio: abre no primeiro monitor do Wallpaper Engine. Um número escolhe outro, na numeração do próprio Wallpaper Engine.',
};

const form = document.querySelector('#command-form');
const command = form.elements.namedItem('command');
const name = form.elements.namedItem('name');
const monitor = form.elements.namedItem('monitor');

function showFields() {
  const value = command.value;
  document.querySelector('#name-field').classList.toggle('hidden-field', !NAMED[value]);
  document.querySelector('#name-label').textContent = NAMED[value] ?? 'Nome';
  document.querySelector('#monitor-field').classList.toggle('hidden-field', !MONITOR_NOTES[value]);
  document.querySelector('#monitor-note').textContent = MONITOR_NOTES[value] ?? '';
}

function load(jsn) {
  const settings = jsn?.param ?? {};
  command.value = KNOWN.includes(settings.command) ? settings.command : 'next';
  name.value = typeof settings.name === 'string' ? settings.name : '';
  monitor.value = settings.monitor ?? '';
  showFields();
}

function save() {
  showFields();
  $UD.sendParamFromPlugin({ command: command.value, name: name.value.trim(), monitor: monitor.value === '' ? '' : Number(monitor.value) });
}

$UD.connect();
$UD.onAdd(load);
$UD.onParamFromApp(load);
$UD.onParamFromPlugin(load);

command.addEventListener('change', save);
// change fires on Enter or when the field loses focus, so a name is not sent letter by letter.
name.addEventListener('change', save);
monitor.addEventListener('change', save);
form.addEventListener('submit', (event) => event.preventDefault());
showFields();
