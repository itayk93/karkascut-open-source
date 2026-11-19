# KarkasCut

A local video editor for Hebrew talking-head videos and short clips. The React interface combines transcript editing, timeline cuts, captions, B-roll and FFmpeg export. Optional speech alignment and eye-contact processing have separate setup steps.

This is a clean source release under MIT for the project code. Third-party code, media and native templates keep their separate licenses. See `THIRD_PARTY_NOTICES.md`.

## Requirements

- Node.js 22.12 or newer, or Node.js 24.
- FFmpeg and FFprobe available on PATH.
- Your own API credentials for any optional provider features you use. Provider calls may incur charges on your account. No credentials are included.

## Run locally

```sh
npm ci
cp .env.example .env
npm run dev
```

The development UI runs at `http://localhost:3000`, with the backend on port 3050. Use the API-key settings screen or your local environment for provider credentials. Keep `.env`, local key files and uploaded recordings out of Git.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

A production build serves the UI from the local backend. This does not turn the backend into an authenticated public service. Read `SECURITY.md` before enabling LAN access. Do not expose the editor directly to the internet.

## Editing and verification limits

Word times may be estimated unless an optional alignment step succeeds. Review the actual cut points and final export. Passing automated tests does not establish word-level accuracy or natural retake quality on your recordings. Keep the original video and check the result before publishing.

The optional Python speech and eye-contact integrations need their own environments and dependencies. See the setup scripts and the vendor notices. The test suite includes synthetic media fixtures; it is not a physical-phone or production-load certification.

## Mobile source

The iOS and Android Capacitor projects are included. Native builds require the appropriate platform tools and signing. No signed app, store submission or physical-device acceptance is claimed by this source release. Default native template artwork is identified in the notices rather than represented as original project artwork.

## Privacy and services

The editor runs on your computer. Features using transcription, AI editing or eye-contact providers may send the media or text needed for that feature to the selected service. Review that provider's terms and configure only services you intend to use. The interface also loads fonts from Google Fonts. Local/LAN browser-origin checks are not user authentication or a firewall.

## Release contents

This release includes source code and licensed assets, without runtime data, compiled Python caches or vendor sample videos. Create or supply your own sample footage.
