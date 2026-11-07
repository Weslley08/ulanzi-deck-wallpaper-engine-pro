# Contributing

This plugin uses the same CI and release pipeline as [Clima Pro](https://github.com/Weslley08/ulanzi-deck-clima-pro) and the other Ulanzi plugins: [`ulanzi-plugin-pipeline`](https://github.com/Weslley08/ulanzi-plugin-pipeline). The rules themselves are in that repository. This page is what they mean for you.

## Set up

Use Node 20.12.2 (`.nvmrc`):

```sh
npm run setup   # dependencies from the lockfiles, without install scripts
npm run check   # structure, SDK pin, type check and tests
npm run audit
```

`npm run test:coverage`, `npm run package`, `npm run verify:package`, `npm run check:secrets` and `npm run measure` are what the pipeline runs too, so you can run the same thing on your machine, including from a fork.

## The branch flow

```
feature/*, fix/*, chore/*...  ->  develop  ->  release/vX.Y.Z  ->  main
```

A person merges at each arrow, and the rest happens by itself:

- **Gate** decides whether a change may merge: the branch rules, tests, coverage, the zip, known vulnerabilities, CodeQL and dependency review. It also runs each week.
- **Delivery** moves the change along: it opens the pull requests, raises the version, builds and validates a release, creates the draft and publishes it.

Merging into `main` publishes the release. Before that, the maintainer runs [docs/VERIFY.md](docs/VERIFY.md) on a device with the zip from the draft, then approves. A CI pass alone is not device validation, and the notes say what has and has not run.

## Rules of this plugin

- Only documented Wallpaper Engine command line features and only documented Ulanzi SDK methods. See [docs/API-SOURCES.md](docs/API-SOURCES.md).
- The vendored Ulanzi SDK is never edited. Update it by pinning a reviewed upstream commit in `sdk-lock.json`.
- Run Wallpaper Engine only with `execFile` and an argument list, never through a shell, and never with text that came from settings.
- Avoid network polling, unnecessary child processes, open local ports and unbounded memory. The key queries Wallpaper Engine when it is added, pressed or shown again, and at no other time.
- Protect user-specific wallpaper names and paths. They stay out of logs, issues and tests that are not about them. Do not commit personal telemetry or the `benchmark-data/` folder.
- Windows is the only target of the Wallpaper Engine commands. Linux and macOS run the tests with injected stand-ins, and do not claim that Wallpaper Engine itself runs there.
