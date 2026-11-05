# Real-device verification — not yet completed

Phase 0: this repository does **not** contain an installable plugin ZIP yet.

When Phase 1 is complete, verify on **Windows + Wallpaper Engine running + Ulanzi Studio + D200**:

- [ ] Install a reviewed ZIP with all pinned SDK files/dependencies.
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
