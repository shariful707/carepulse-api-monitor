# Security and data handling

CarePulse is a local assessment prototype. It is not a production healthcare service or a compliance-certified system.

- The default host is `127.0.0.1`. Read endpoints are unauthenticated. Deploy behind proper authentication and TLS before giving remote users access.
- `MONITOR_API_KEY` optionally protects every POST route. Cross-origin browser writes are rejected. The write key remains in browser-tab memory.
- Provider and SMTP secrets are stored only on the backend. Saved settings are plaintext in the ignored local data directory. Protect that directory with operating-system permissions. An attempted `0600` file mode does not replace Windows ACL configuration.
- Settings responses expose credential-presence flags instead of saved keys or passwords. Logs omit sensitive field names; provider bodies and SMTP errors are not logged.
- Only aggregate API metadata is accepted. Do not put patient information in service names, imported JSON, provider prompts or screenshots.
- Request sizes and batch sizes are bounded. SQL values are bound parameters. Dynamic browser text is escaped or rendered with `textContent`. The server enforces a restrictive Content Security Policy.
- Email uses plain text. SMTP requires encryption by default; disable it only for a trusted loopback development sink. A `sent` record means SMTP acceptance, not confirmed inbox delivery.

For a vulnerability, contact the repository owner privately through their GitHub profile. Do not post credentials or sensitive telemetry in a public issue.
