# Phase 1 — Ulanzi live Current Wallpaper action

**Goal:** on Ulanzi D200, a single installed action queries the Wallpaper Engine's current wallpaper for the **primary monitor**, with a sensible fallback state if Wallpaper Engine is stopped. No undocumented SDK calls.

## Required work

1. Inspect current source, `CLAUDE.md`, official SDK V3.1 references and [Clima PRO](https://github.com/Weslley08/ulanzi-deck-clima-pro). Do not copy Clima's weather logic.
2. Review/pin official SDK copies for Node and HTML (with upstream commits, file hashes and licenses). Use the tested, documented Ulanzi host lifecycle; keep SDK files unmodified.
3. Create `com.ulanzi.wallpaperenginepro.ulanziPlugin/manifest.json` and resources, with unique UUID `com.ulanzi.wallpaperenginepro.ulanziPlugin`; follow Ulanzi manifest/action fields. Do not publish UUID to the store before verifying the shape.
4. Wire a single `Current Wallpaper` action to the already implemented `plugin/wallpaper-engine-cli.js`. Query via `-control getWallpaper` **without** `-monitor` for the primary wallpaper. No polling while no key is active.
5. Build a minimal Property Inspector for an explicit, validated executable path. No file uploading, no credentials and no private wallpaper paths in logs.
6. Implement key rendering using supported image/data URI mechanism, with three states: wallpaper present, Wallpaper Engine unavailable, and configuration required. Do not claim unsupported live animated thumbnail rendering.
7. Test against a fake Ulanzi host: registration, key press (only `run`), settings, disconnected/no wallpaper, reconnection and cleanup. Keep all tests deterministic and offline.
8. Provide `npm run package` only when the ZIP includes all runtime dependencies, SDK, assets and manifests. Verify package contents and checksum before suggesting an installation.

## Explicitly excluded from Phase 1

Six favorite buttons, categories, continuous 3×2 gallery, animations, custom wallpapers, playlist controls, lock screen, GPU-based preview, Store submission, auto-release and modifying Clima PRO.

## Acceptance

- `npm ci`, `npm test`, lint/typecheck (if added), security checks and ZIP verification all pass.
- A fake-host test proves the single action follows the Ulanzi SDK V3.1 event contract.
- Manual Ulanzi Studio/D200 validation records what was actually seen on the user's Windows machine (not inferred from CI).
- Stop after this phase, record CMR / RTK / weekly quota deltas and list limitations honestly.
