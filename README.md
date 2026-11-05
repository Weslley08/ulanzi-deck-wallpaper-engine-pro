# Wallpaper Engine PRO for Ulanzi D200

[![CI](https://github.com/Weslley08/ulanzi-deck-wallpaper-engine-pro/actions/workflows/ci.yml/badge.svg)](https://github.com/Weslley08/ulanzi-deck-wallpaper-engine-pro/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

A Windows-first plugin for **Ulanzi Studio / Ulanzi D200**, integrating official [Wallpaper Engine](https://help.wallpaperengine.io/en/functionality/cli.html) controls.

> **Status: Phase 0 (development bootstrap).** Not yet a loadable Ulanzi plugin. The first implemented component is a small, testable adapter for the Wallpaper Engine's documented CLI. Ulanzi SDK V3.1 hosting, assets and manifest are the next phase. Do **not** distribute a ZIP or claim live device support yet.

## Planned features

- **Monitor:** use the primary monitor by default, without assuming monitor index 0 is always the primary display
- **Six configured buttons (1–6):** controls or pinned wallpaper choices
- **Continuous 3×2 display:** six-key visual mode, with a clean static fallback
- **Experimental animation:** optional, gated by real-device performance and supported Ulanzi APIs
- **Lock screen:** prepare a static wallpaper image only where Windows supports it
- **Resource efficiency:** event-first; no rapid polling, no unbounded child processes, no GPU-intensive copies

## Grounded integration

Wallpaper Engine documents the executable `wallpaper64.exe` / `wallpaper32.exe` and the command `-control getWallpaper`, which writes the primary wallpaper path to stdout. An optional `-monitor N` targets a numeric index. The current adapter implements only **this query**.

Ulanzi Studio's SDK and plugin layout will follow the project's existing reference, [Clima PRO](https://github.com/Weslley08/ulanzi-deck-clima-pro). Source SDK files will be pinned before being bundled, **not hand-edited or replaced by undocumented methods**.

### Get started (development)

Install Node.js 20.12.2, then:

```powershell
git clone https://github.com/Weslley08/ulanzi-deck-wallpaper-engine-pro.git
cd ulanzi-deck-wallpaper-engine-pro
npm ci
npm test
npm run check:structure
```

The adapter is a **library**, not an installable command or a running Ulanzi action. It requires an explicit, trusted absolute Windows path to the Wallpaper Engine executable and never executes through a shell.

## Development roadmap

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Reference-aligned repository, official CLI adapter, tests, benchmark plan and CI | Implemented as source |
| 1 | Ulanzi SDK V3.1 runtime, one Current Wallpaper key, settings and fake-host tests | **Next** |
| 2 | Six configurable keys, per-key settings, robust command execution | Planned |
| 3 | 3×2 continuous visual mode, refresh and lifecycle optimization | Planned |
| 4 | Optional animation, static lock-screen export, measurement and release validation | Planned |

Full first phase acceptance: [docs/PHASE-1.md](docs/PHASE-1.md). Baseline for CMR + RTK: [docs/BENCHMARK.md](docs/BENCHMARK.md).

## Development, safety and release policy

This project deliberately keeps the **CI gate** separate from the Clima PRO release pipeline. No release or Store publication is permitted before a real Ulanzi Studio / D200 validation, review of the SDK bundle, security checks and human approval.

```text
src-equivalent: com.ulanzi.wallpaperenginepro.ulanziPlugin/
  plugin/wallpaper-engine-cli.js   # pure official command adapter, independent of Ulanzi SDK
tests: test/*.test.mjs
instructions: CLAUDE.md
benchmark: docs/BENCHMARK.md
```

No telemetry, API token, proxy, remote wallpaper uploads, shell execution, or undocumented Wallpaper Engine APIs. See [SECURITY.md](SECURITY.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

This is an independent open-source project and is not affiliated with Ulanzi, Steam or Wallpaper Engine. License: [Apache-2.0](LICENSE).
