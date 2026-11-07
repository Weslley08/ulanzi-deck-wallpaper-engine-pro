# Real-device verification

The automated checks use a fake Ulanzi Studio and a fake Wallpaper Engine. They cannot see the deck or the real program, so this list is run by hand, with the zip from the release draft.

Verify on **Windows + Wallpaper Engine running + Ulanzi Studio + D200**:

- [ ] Install the reviewed zip, with all pinned SDK files and dependencies.
- [ ] Studio displays the action and settings; no unexpected prompts or console leaks.
- [ ] Primary wallpaper is shown after a single key invocation.
- [ ] Changing wallpaper in the Wallpaper Engine reflects after the next supported refresh/action.
- [ ] With no path ever entered, the key finds the running Wallpaper Engine by itself.
- [ ] With Wallpaper Engine stopped, the key shows `Wallpaper Engine não está em execução`, does not start it, and recovers on the next press after starting it.
- [ ] Installed in a Steam library on a drive other than C:, it is still found.
- [ ] Restarted from another folder or drive, the next press follows it.
- [ ] Run as administrator (Studio not elevated), the key shows `Não foi possível detectar o Wallpaper Engine` and **Detectar novamente** recovers once it runs normally.
- [ ] The inspector has no path field, only the state and **Detectar novamente**.
- [ ] The short titles (`WE fechado`, `WE não detectado`, `WE ativo`, `WE sem resposta`) are legible on the D200 key, on two lines.
- [ ] The settings panel shows one column, with no overlapping text, at Studio's panel width; **Detectar novamente** shows `Detectando…` while it works.
- [ ] With `getWallpaper` printing nothing, the key shows `WE ativo`, the Studio log has one `query failed: empty output` line (not one per press), and command keys still work.

Wallpaper Command keys, with six on the D200:

- [ ] Each of the six keys shows its own icon and label, and keeps its action after Studio restarts.
- [ ] `Próximo wallpaper` with no monitor changes every monitor; with a monitor number, only that one (write down which index is which screen).
- [ ] `Pausar`, `Reproduzir`, `Mutar` and `Desmutar` do what they say, and write down whether Wallpaper Engine returns a non-zero exit code on success (the key would flash an alert).
- [ ] `Abrir playlist` and `Abrir perfil` open an existing one by its exact name; a key without a name flashes an alert and runs nothing.
- [ ] After `Próximo wallpaper`, a Current Wallpaper key on the deck updates.
- [ ] Pressing a command key many times quickly does not send the command more often than it finishes.
- [ ] With Wallpaper Engine closed, a command key flashes an alert and does not start it.
- [ ] If the key shows `Não foi possível ler o wallpaper`, the Studio log line `Wallpaper Engine query failed: <reason>` is recorded (timed out, exit code N, empty output...).
- [ ] No duplicate key execution due to `keydown` and `run`.
- [ ] On Studio restart, the connection, settings and key state recover.
- [ ] CPU, RSS memory and redraw frequency were measured during idle and activation.
- [ ] RTK/CMR performance notes contain factual measurements, not inferred savings.
- [ ] No leak of wallpaper file path, personal folder names or tokens in logs.
- [ ] The format `getWallpaper` really prints (a `project.json` path, a folder or a file) is written down, and the name on the key is the one expected.
- [ ] The minimum Ulanzi Studio version in `manifest.json` (`Software.MinVersion`) is confirmed for SDK V3.1.
