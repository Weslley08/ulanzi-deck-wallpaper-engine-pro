# Security

Report vulnerabilities privately at https://github.com/Weslley08/ulanzi-deck-wallpaper-engine-pro/security/advisories/new.

This first phase uses only the documented local Wallpaper Engine CLI. The adapter executes an **explicit, trusted absolute executable path** with `execFile`, `shell:false`, a bounded timeout and a small stdout buffer. The basename check is not a signature or authenticity check; users still need to choose the genuine executable.

No tokens, telemetry, remote wallpaper uploads or arbitrary shell commands. The adapter does not log the active wallpaper path, which can disclose usernames and local folders. Wallpaper Engine should be running before commands are sent.

The Ulanzi SDK is not bundled in this bootstrap and the plugin is not yet installable. Before bundling: pin upstream files, retain their licenses, document dependencies and verify Ulanzi Store terms. Do not bypass CI or publish a release before actual host/device validation.
