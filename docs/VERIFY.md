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
- [ ] The long Portuguese titles fit or wrap legibly on the D200 key.
- [ ] If the key shows `Não foi possível ler o wallpaper`, the Studio log line `Wallpaper Engine query failed: <reason>` is recorded (timed out, exit code N, empty output...).
- [ ] No duplicate key execution due to `keydown` and `run`.
- [ ] On Studio restart, the connection, settings and key state recover.
- [ ] CPU, RSS memory and redraw frequency were measured during idle and activation.
- [ ] RTK/CMR performance notes contain factual measurements, not inferred savings.
- [ ] No leak of wallpaper file path, personal folder names or tokens in logs.
- [ ] The format `getWallpaper` really prints (a `project.json` path, a folder or a file) is written down, and the name on the key is the one expected.
- [ ] The minimum Ulanzi Studio version in `manifest.json` (`Software.MinVersion`) is confirmed for SDK V3.1.
