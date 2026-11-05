# Real-device verification

The automated checks use a fake Ulanzi Studio and a fake Wallpaper Engine. They cannot see the deck or the real program, so this list is run by hand, with the zip from the release draft.

Verify on **Windows + Wallpaper Engine running + Ulanzi Studio + D200**:

- [ ] Install the reviewed zip, with all pinned SDK files and dependencies.
- [ ] Studio displays the action and settings; no unexpected prompts or console leaks.
- [ ] Primary wallpaper is shown after a single key invocation.
- [ ] Changing wallpaper in the Wallpaper Engine reflects after the next supported refresh/action.
- [ ] With Wallpaper Engine stopped, key shows a safe unavailable state and no crash.
- [ ] If executable path is missing/wrong, the inspector offers a recoverable configuration state.
- [ ] No duplicate key execution due to `keydown` and `run`.
- [ ] On Studio restart, the connection, settings and key state recover.
- [ ] CPU, RSS memory and redraw frequency were measured during idle and activation.
- [ ] RTK/CMR performance notes contain factual measurements, not inferred savings.
- [ ] No leak of wallpaper file path, personal folder names or tokens in logs.
- [ ] The format `getWallpaper` really prints (a `project.json` path, a folder or a file) is written down, and the name on the key is the one expected.
- [ ] The minimum Ulanzi Studio version in `manifest.json` (`Software.MinVersion`) is confirmed for SDK V3.1.
