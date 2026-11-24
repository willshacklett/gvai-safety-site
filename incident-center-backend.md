# Customer Incident Center backend requirements

Phase 1 is a static workspace preview. Open `portal.html#/incidents`, then follow the sample notification to `portal.html#/incidents/DEMO-001`. The same detail URL can be opened directly. Only the fixed synthetic identifier is used. The review and notification preferences reset on reload. Notification preferences start with all channels off and use one shared severity threshold.

## Before connecting live data

- Require server-side authentication and authorize the requesting account, role, tenant, and incident ownership for every incident read or write. Enforce these checks on direct links and after sign-in redirects. Treat the link identifier as opaque and keep contact details, evidence, and credentials out of URLs.
- Supply tenant-scoped incident summaries with evidence redaction, explicit uncertainty, and authoritative status. Keep advisory, review, acknowledgment, and enforcement state distinct. The prototype has no enforcement integration.
- Persist acknowledgment and human review requests with actor, timestamps, audit events, and retry-safe writes. Provide a real reviewer queue and server-confirmed status.
- Verify destination ownership per channel. Persist severity thresholds, delivery preferences, consent history, and revocation. Enforce opt-out and suppression at send time. Add rate limiting, retry and deduplication controls, and delivery audit records before enabling SMS or email.
- Gate incident chat behind the same access checks. Authorize and minimize context on the server, redact sensitive evidence, and enforce the applicable retention policy before making any chat request.
