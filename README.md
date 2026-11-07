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

The plugin layout and the build and release pipeline follow [Clima PRO](https://github.com/Weslley08/ulanzi-deck-clima-pro). The official Ulanzi SDK files are vendored unmodified and pinned by commit and checksum in `sdk-lock.json`, and `npm run check:sdk` verifies them. **No undocumented methods are used.**

The key shows the **name** of the wallpaper on the primary monitor, not a preview image: the command line returns a path, and nothing documents a thumbnail.

## Setup

There is nothing to configure. Put the **Current Wallpaper** action on a key while Wallpaper Engine is running: the plugin finds it by itself, in any Steam library or drive, and shows the wallpaper of the primary monitor. Press the key to refresh.

| The key says | Meaning | What to do |
|---|---|---|
| the wallpaper's name | Found and answered | — |
| `WE fechado` | No `wallpaper64.exe` or `wallpaper32.exe` is running | Start Wallpaper Engine, then press the key |
| `WE não detectado` | It may be running, but its location could not be confirmed: for example two installations at once, or it runs as administrator | Press the key, or **Detectar novamente** in the key's settings |
| `WE ativo` | Found and running, but `getWallpaper` printed nothing | The commands still work. See the limitation below |
| `WE sem resposta` | Found, but `getWallpaper` failed or timed out | Press the key again |

The settings panel shows the full sentence for each state.

How it finds the program: Windows lists running processes with their executable path in the documented `Win32_Process` class, which the plugin reads through the system's own PowerShell (`Get-CimInstance`), with a fixed command and no shell. It looks only when a key is added, pressed or shown again, never in the background, and it never starts Wallpaper Engine. Your folders never go to its logs, and a failure repeated on every press is logged once a minute with a count.

### Wallpaper Command keys

Put **Wallpaper Command** on as many keys as you like, such as the six of a D200, and choose in each key's settings what it does. Each key keeps its own choice after Studio restarts.

| Action | Wallpaper Engine command | Monitor |
|---|---|---|
| Próximo wallpaper | `nextWallpaper` | Empty changes **all** monitors; a number changes that one |
| Pausar / Reproduzir | `pause` / `play` | All wallpapers |
| Mutar / Desmutar | `mute` / `unmute` | All wallpapers |
| Abrir playlist pelo nome | `openPlaylist -playlist <name>` | Empty opens on the **first** monitor; a number picks another |
| Abrir perfil pelo nome | `openProfile -profile <name>` | — |

Monitor numbers are Wallpaper Engine's own: 0 is its first monitor, which is not necessarily the Windows primary display. If Wallpaper Engine is not running, or the command fails, the key flashes an alert and nothing is started.

### Limitations

- **`getWallpaper` may print nothing.** On the device it was seen to run and return no output, so the key shows `WE ativo` instead of a name. The documentation says it writes to standard output, and no documented way to capture it otherwise was found, so this stays a fallback rather than a workaround.
- **No favorite wallpapers.** Wallpaper Engine documents no command to list installed or favorite wallpapers. Picking them would mean reading Steam or Wallpaper Engine folders, which is neither documented nor public, so it is not done. `openWallpaper` needs a file path, which this plugin never asks for.

## Development

Install Node.js 20.12.2 (`.nvmrc`), then:

```powershell
git clone https://github.com/Weslley08/ulanzi-deck-wallpaper-engine-pro.git
cd ulanzi-deck-wallpaper-engine-pro
npm run setup          # root and plugin dependencies, from the lockfiles, without install scripts
npm run check          # structure, SDK pin, type check and tests
npm run test:coverage  # tests, and a floor for lines, branches and functions
npm run package        # dist/<plugin>.zip
npm run verify:package # checks the zip and starts it from nothing but its own files
npm run check:secrets
npm run measure
```

Contributions go through the branch flow in [CONTRIBUTING.md](CONTRIBUTING.md).

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
