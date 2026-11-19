# Security and privacy

KarkasCut is a local desktop/LAN editing tool, not a hardened multi-user internet
service. Do not expose its backend, Vite dev server, or settings endpoints to the
public internet. Use trusted networks only. Authentication and per-user isolation
must be designed before any hosted deployment.

## Data and credentials

- `.env`, `.api-keys.local.json`, uploads, project data and local Python environments
  are not source assets and must remain untracked.
- Use synthetic fixtures when reporting bugs. Do not attach personal videos,
  transcripts, credentials, or diagnostic files without checking their contents.
- OpenAI transcription/editing sends audio or transcript content to OpenAI.
  NVIDIA eye-contact correction can send video to NVIDIA when configured.
- Treat provider calls as potentially billable. The automated test suite uses
  local synthetic data and does not call these providers.

## Dependency audit

On 2026-11-19, both `npm audit` and `npm audit --omit=dev` reported zero known vulnerability entries for the committed lockfile. This is dated dependency-advisory evidence, not a guarantee that the application has no vulnerabilities. Recheck both commands after installation or dependency changes.

## Reporting

Use a private channel to the repository owner for security reports. Do not post
credentials, exploit data, or private media in a public issue. If a private reporting option is not available, open an issue only to request a private contact method, without the vulnerability details or sensitive data.

## Browser access boundary

The backend rejects untrusted browser origins and Host names before parsing
request bodies or reaching settings, uploads, media or processing routes.
Default origins cover the configured local Vite frontend on port 3000 (plus 5173) and standard Capacitor localhost
origins. The UI served by the backend remains same-origin on loopback or a
private IPv4 LAN address. An opaque `null` origin is rejected.

For another trusted frontend or a local hostname, set exact comma-separated
origins in `KARKASCUT_ALLOWED_ORIGINS`, for example
`http://192.168.1.10:3000`. Do not use wildcards. A configured origin also trusts
its hostname as a backend Host name. Only add hosts you control and trust.

This is not authentication, user isolation or a firewall. Non-browser clients
without Origin remain usable on a trusted network, and the server retains its
LAN listening behavior for the native app. Do not expose it to an untrusted
network or the internet. A reverse proxy must preserve the trusted Host and
protocol or be configured explicitly; proxy forwarding headers are not trusted.

HTTP regression tests cover standard native origins, not a physical iPhone or
Android device run. This change requires no mobile rebuild.

Trusted cross-site media previews use anonymous CORS so the backend can verify their Origin. Cross-site requests without Origin stay blocked.
