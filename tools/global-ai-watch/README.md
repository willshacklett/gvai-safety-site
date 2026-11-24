# Global AI Watch local preview

From the repository root, run:

```sh
python3 tools/global-ai-watch/preview.py --port 8002
```

Open <http://127.0.0.1:8002/#global-ai-watch>. In Codespaces, keep the forwarded port private and open its HTTPS preview URL with `/#global-ai-watch` appended. The preview accepts only loopback hosts and the exact forwarded hostname derived from the active Codespace and listening port. The preview requires outbound HTTPS access to the official providers. A standalone static server has no feed endpoint and preserves links to the official pages.

## Sources and metrics

- [OpenAI public summary](https://status.openai.com/api/v2/summary.json) and [incident history](https://status.openai.com/api/v2/incidents.json) return provider-level health, components, and published incident updates. The observed summary lacks an incident list, so the dashboard derives its reported active count from the official history returned by the feed.
- [Claude public API](https://status.claude.com/api) documents its [summary](https://status.claude.com/api/v2/summary.json) and [incident history](https://status.claude.com/api/v2/incidents.json). Reconciliation deduplicates incidents across both files and excludes resolved, postmortem, scheduled, and completed entries from the active count.
- [xAI documentation](https://docs.x.ai/developers/debugging) links its [official status page](https://status.x.ai/) and [RSS feed](https://status.x.ai/feed.xml). The preview validates RSS and displays the latest incident title, publication date, official link, and description. It displays incident phase only when explicitly supplied as a recognized structured value. No public component-health endpoint was verified. An empty feed carries no operational signal.

The summaries report provider-wide health. The affected-service count includes reported non-operational leaf components, including maintenance. Incident counts cover entries supplied by the official feeds, which can limit their history. Recent events show official incident titles, phases, and timestamps. The checked time records when the preview validated the responses. The website does not receive internal workload, customer-specific availability, or agent counts.

The preview requests only the two fixed official JSON resources per JSON provider and the fixed xAI RSS URL. It rejects redirects and XML DTDs. It applies a 90-second refresh interval and shared in-memory cache, timeout and size limits, and an explicit source allowlist. Failed refreshes display a labeled last-known reading for up to 15 minutes before the data becomes unavailable. The browser skips the local endpoint outside loopback and GitHub Codespaces preview origins. A production implementation would require separately authorized hosting and review of provider usage terms. The existing static packaging workflow is untouched.

## Mock tests

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tools/global-ai-watch -v
node tools/global-ai-watch/test_watch.cjs
```

These tests use synthetic responses in the test process only. A successful live preview additionally requires the server to bind locally and reach the official provider hosts. In this workspace the sandbox blocked binding and outbound shell DNS resolution. Official JSON was checked separately through web retrieval. The web verifier identified the xAI response type as XML but could not inspect the body. Direct shell and Python requests failed at DNS, so no live xAI incident count was verified in this environment.
