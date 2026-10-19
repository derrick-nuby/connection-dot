# Connection Dot

A prominent 20-pixel status dot in the GNOME top bar for internet responsiveness.

**Development preview — not yet qualified on GNOME 48–50 or published on GNOME Extensions.**

Green means repeated successful, responsive checks; amber means slow or intermittent checks; red means offline with corroborating system evidence. Blue means checking or unable to verify. Captive portals show “Sign-in required”. Click the indicator for endpoint results, response times, the last check, and preferences.

## Privacy and limitations

With active checks enabled, requests go to Mozilla's `https://detectportal.firefox.com/success.txt` and Fedora's `https://fedoraproject.org/static/hotspot.txt` every 30 seconds (at least 120 seconds on metered networks). Providers see normal request metadata such as your IP address. No account, analytics, cookies, identifiers, or measurement history is stored. Disable checks in preferences. Request response time is not bandwidth or ICMP ping. One failing endpoint does not establish an internet outage.

## Build and development

Use Node.js 24, npm, Python 3, GNOME's extension tool, and GLib schema tools. Runtime requires GNOME Shell, GIO, and libsoup 3.

```sh
npm ci
npm run check
npm test
npm run pack
npm run build:dev
npm run install:dev
```

The development UUID is `connection-dot-dev@derrick-nuby.github.io`; production uses `connection-dot@derrick-nuby.github.io`. Their settings are separate. `npm run dev` watches TypeScript; explicitly rebuild/install when loading changes. On Wayland log out and back in, or use an isolated nested Shell. Toggling does not reliably reload cached modules. GNOME 48 uses `--nested --wayland`; newer versions use `--devkit --wayland` in a separate D-Bus session.

## Manual installation

After building or downloading a trusted release ZIP:

```sh
gnome-extensions install artifacts/connection-dot.shell-extension.zip
# Log out and back in if the extension is not discovered.
gnome-extensions enable connection-dot@derrick-nuby.github.io
gnome-extensions info connection-dot@derrick-nuby.github.io
```

Use `install --force` when updating. Verify the supplied SHA-256 checksum. Settings persist between updates. To roll back, install the earlier ZIP with `--force` and restart the session. To remove:

```sh
gnome-extensions disable connection-dot@derrick-nuby.github.io
gnome-extensions uninstall connection-dot@derrick-nuby.github.io
```

The GNOME Extensions listing will be linked only after approval. Browser installation requires GNOME Shell Integration and the distro's browser connector.

## Screenshots

Screenshots will be supplied by the maintainer. See [capture instructions](docs/screenshots/README.md); no simulated product images are presented here.

## Releases and qualification

Version tags create draft releases with automatic notes, install ZIP, checksum, and source commit. Test the exact artifact before publishing; then manually submit the same ZIP to GNOME Extensions. See [release checklist](docs/RELEASING.md).

## Troubleshooting

Check `gnome-extensions info` and Shell logs with `journalctl --user -b`. Report distro, Shell version, extension version, and sanitized errors. A neutral indicator may mean blocked check endpoints or unavailable system connectivity evidence. Do not disable TLS verification to resolve failures.

## Contributing

Run checks and tests before submitting a change. Keep Shell and preferences imports separate, use asynchronous I/O, and release all resources on disable. Include the behavior being fixed and validation in pull requests. Never commit credentials or personal network data.

GPL-3.0-or-later. See [LICENSE](LICENSE).
