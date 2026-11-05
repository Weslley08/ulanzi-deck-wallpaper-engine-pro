# Wallpaper Engine PRO — Claude Code project guidance

This is an actual Ulanzi D200 plugin project, not a sample app. Its user has **33% of their weekly Claude Pro usage remaining** at benchmark start. Treat that quota as scarce.

## Sources of truth
- Ulanzi Studio SDK V3.1 and its official Ulanzi JS plugin protocol, no undocumented methods.
- Development conventions: `Weslley08/ulanzi-deck-clima-pro` (reference ONLY; do not mutate it).
- Wallpaper Engine CLI: https://help.wallpaperengine.io/en/functionality/cli.html
- Current branch's `docs/PHASE-1.md` is the **only authorized implementation scope**.

## Phase 1 scope and safety
- Integrate a properly pinned Ulanzi SDK into the plugin folder, using the reference's pattern. Do not modify vendored SDK.
- Build a single **Current Wallpaper** action on the Ulanzi keypad. Consult the current primary wallpaper via `getWallpaper`; do **not** assume `-monitor 0` is the primary screen.
- Use `execFile` argument arrays (`shell:false`), validate executable path, bound runtime and buffer, never execute arbitrary command text.
- Handle **run** events only for a press, and preserve Ulanzi host event / settings lifecycle.
- Avoid logging private paths, settings, serial numbers or other secrets.
- CI/test/build requirements stay blocking; do not suppress failures.
- Do not implement the six-button gallery, animations, lock screen or release yet.
- Do not edit CMR, RTK, global Claude Code settings, the Clima PRO repo or other projects.

## Efficiency / benchmark
- Keep reasoning concise, inspect only relevant files, do not repeatedly print giant directories or minified SDK files.
- Do not force a model; CMR picks Haiku/Sonnet/Opus.
- If the user's **weekly quota** reaches 28% or less, stop implementation and report what is done.
- After finishing this phase, stop. Give tests, files changed, official API evidence, remaining gaps, RTK commands run and the exact instructions to capture `/cmr stats`.
- Never say that proxyless routing or shell compression guarantees lower weekly usage.
