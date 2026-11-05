# Official API boundaries

## Wallpaper Engine

Documentation: https://help.wallpaperengine.io/en/functionality/cli.html

Windows executables: `wallpaper64.exe` or `wallpaper32.exe`. The process must already be running. Supported *documented* commands include `getWallpaper`, `nextWallpaper`, `openWallpaper`, `openPlaylist`, `pause`, `play`, `mute` and `unmute`.

Phase 0 adapter executes only:

```text
wallpaper64.exe -control getWallpaper
wallpaper64.exe -control getWallpaper -monitor 2   # Only when a monitor index was explicitly chosen
```

`getWallpaper` writes the current wallpaper path to stdout. **No `-monitor` is the documented default primary wallpaper**. Do not assume index 0 necessarily identifies the Windows primary display.

Do not infer a thumbnail, GIF, animated preview, device wallpaper image, Steam API or file-parse capability from the command's returned path. Any such feature requires separate evidence and tests. Avoid loading huge videos or scene assets into memory.

## Ulanzi

Official SDK sources:
- https://github.com/UlanziTechnology/plugin-common-node
- https://github.com/UlanziTechnology/plugin-common-html
- https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK
- Pinned reference and structure: https://github.com/Weslley08/ulanzi-deck-clima-pro/blob/main/sdk-lock.json

Clima PRO uses the Ulanzi Studio Node 20.12.2 runtime, a `com.ulanzi.*.ulanziPlugin` folder, `manifest.json`, `plugin/app.js`, action resources, settings inspector and a pinned SDK copy.

Phase 1 must align this structure with the current official SDK V3.1 documentation. Do not claim the SDK is bundled in Phase 0. 
