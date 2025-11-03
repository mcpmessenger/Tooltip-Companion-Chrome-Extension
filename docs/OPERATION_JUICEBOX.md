# Operation Juicebox Reliability Program

Operation **Juicebox 🧃** is the multi-phase initiative to raise the Tooltip Companion platform to production-grade reliability, security, and maintainability. This document captures the execution plan, status, and artifacts created as we implement the upgrades.

## Guiding Principles

- Ship in **observability-first increments** so every change can be verified quickly.
- Prefer **automated, repeatable workflows** over manual fixes.
- Treat the backend and extension as **one product surface**—feature and doc updates land together.
- Maintain a **clear audit trail** (docs, scripts, IaC) for every operational change.

## Phase Tracker

| Phase | Theme | Current Focus | Status |
| :--- | :--- | :--- | :--- |
| Phase 1 | Backend Stabilization & Observability | Health checks, alarms, resilience patterns | 🚧 In progress |
| Phase 2 | Reliability & Compatibility | CSP fallback and secure screenshot delivery | ⏳ Next |
| Phase 3 | QA & Automation | Tests, CI/CD, staging parity | ⏳ Scheduled |
| Phase 4 | Documentation & Strategy | Ops guide, architecture, telemetry roadmap | ⏳ Scheduled |

## Phase 1 — Backend Stabilization & Observability

### Objectives

- [ ] **Automated Health Signals**: Define CloudWatch alarms for ECS service (CPU, memory, 5XX rate). Ship infrastructure scaffolding in `infra/`.
- [x] **Log Aggregation**: Adopt structured logging in `playwright_service` and document CloudWatch Logs Insights queries.
- [x] **Resilience Patterns**: Add retry with exponential backoff and host-level circuit breaking for upstream navigation calls.
- [ ] **ECS Capacity Review**: Document current task sizing, create checklist for memory/CPU tuning.

### Deliverables (in repo)

- `infra/operation-juicebox/` (CloudWatch alarm templates & IaC scaffolding)
- Structured logging utilities in `playwright_service/logger.js`
- Updated `playwright_service/server.js` resilience logic
- Documentation updates: `README.md`, `docs/BACKEND_SETUP.md`, `docs/OPERATION_JUICEBOX.md` (this file)

### Verification

- Logs show JSON-formatted entries with correlation fields
- `/health` exposes retry/circuit-breaker telemetry
- New alarms documented with deployment instructions
- README highlights Operation Juicebox status and backend hardening steps

## Phase 2 — Reliability & Compatibility (Preview)

> Planning notes to guide upcoming work; details will be refined once Phase 1 completes.

- Implement CSP-aware fallback in content script and backend (data-URI fallback landed; signed URLs next)
- Protect `/screenshot/:token` by introducing signed URL middleware with expiry & IP-bound validation
- Perform OWASP-focused hardening pass (rate limiting, input validation, data retention policy)

## Phase 3 — QA & Automation (Preview)

- Stand up automated integration suite (Playwright backend flows, extension smoke tests)
- Wire GitHub Actions (lint, test, build, deploy to staging & prod)
- Establish staging environment parity checklist

## Phase 4 — Documentation & Long-Term Strategy (Preview)

- Author comprehensive Operations Guide & architecture diagrams
- Add user-facing telemetry signals for tooltip failures (extension UX)
- Explore serverless capture pathfinder + lightweight analytics dashboard

## Change Log

| Date | Update | Artifacts |
| :--- | :--- | :--- |
| 2025-11-03 | Kickoff Operation Juicebox, documented Phase 1 plan | `docs/OPERATION_JUICEBOX.md` |
| 2025-11-03 | Shipped structured logging + retry & circuit breaker scaffolding | `playwright_service/logger.js`, `playwright_service/server.js`, `infra/operation-juicebox/*` |
| 2025-11-03 | Added CSP-aware data URI fallback for strict sites | `playwright_service/server.js`, `background.js`, `content.js` |

## Next Actions

1. Land Phase 1 resilience scaffolding in `playwright_service` (retry + circuit breaker + structured logs).
2. Add CloudWatch alarm templates and logging guidance under `infra/operation-juicebox/`.
3. Publish README + backend docs updates to announce Operation Juicebox and new operational guidance.


