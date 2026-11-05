# Contributing

The project follows the technical and safety discipline of [Clima PRO](https://github.com/Weslley08/ulanzi-deck-clima-pro) without copying its deployment triggers.

Use Node 20.12.2 (`.nvmrc`):

```sh
npm ci --ignore-scripts
npm run check
npm run audit
```

Develop on `feature/*`, open pull requests and keep changes scoped. The **CI gate** runs on Windows, Linux and macOS. Windows is the target OS for Wallpaper Engine commands; Linux and macOS use injected stubs to test parsing and security. Do not claim Wallpaper Engine itself runs there.

For Ulanzi integration, vendor and pin the official SDK to reviewed upstream commits; do not edit those files. Test against a fake host and then the real Ulanzi Studio/D200. A CI pass alone is not device validation. There is no automatic release workflow until the first plugin has been manually validated.

Avoid network polling, unnecessary child processes, open local ports and unbounded memory. Protect user-specific wallpaper names and paths; do not commit personal telemetry or the `benchmark-data/` folder.
