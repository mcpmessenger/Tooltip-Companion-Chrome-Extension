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
| Phase 1 | Backend Stabilization & Observability | Deploy CloudWatch alarms, ECS capacity review | 🚧 In progress |
| Phase 2 | Reliability & Compatibility | Secure screenshot endpoint (signed URLs), security hardening | 🚧 In progress |
| Phase 3 | QA & Automation | Tests, CI/CD, staging parity | ⏳ Next |
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

## Phase 2 — Reliability & Compatibility

### Objectives

- [x] **CSP-Aware Fallback**: Implement data URI fallback for strict CSP sites (banking, GitHub). Automatic retry with `preferDataUri` when CSP blocks HTTP images.
- [x] **Buffer Normalization**: Handle Node.js Buffer objects in screenshot responses, convert to data URIs for consistent rendering.
- [ ] **Secure Screenshot Endpoint**: Protect `/screenshot/:token` with signed URLs, expiry, and IP-bound validation.
- [ ] **Security Hardening**: OWASP-focused pass (rate limiting, input validation, data retention policy).

### Deliverables (in repo)

- CSP fallback logic in `content.js` (automatic retry with data URI)
- Buffer normalization in `content.js` and `playwright_service/server.js`
- MCP support for CSP-safe screenshots (`preferDataUri` propagation)
- Updated `background.js` to pass CSP options through MCP path

### Verification

- Tooltips render correctly on HTTPS sites with strict CSP (tested on banking sites, GitHub)
- Console logs show `hasScreenshotDataUri: true` and `screenshotUrlType: 'string'`
- Backend returns data URIs when `preferDataUri: true` is requested
- No more `[object Object]` or Buffer-related rendering failures

### Next Steps

- Implement signed URL middleware for `/screenshot/:token` endpoint
- Add rate limiting and input validation to all backend endpoints
- Document data retention policy and implement cleanup automation

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
| 2025-11-03 | Fixed Buffer normalization & MCP CSP support | `content.js`, `playwright_service/mcp-server.js`, `mcp-client.js`, `background.js` |
| 2025-11-03 | Created `operation-juicebox-v1.5` branch with Phase 1 & Phase 2 CSP fixes | Branch pushed to GitHub |

## Next Actions

1. **Deploy backend to production** - Push resilience patterns + CSP fallback to ECS
2. **Complete Phase 1** - Deploy CloudWatch alarms and review ECS capacity
3. **Continue Phase 2** - Implement signed URLs for `/screenshot/:token` security
4. **Start Phase 3** - Set up automated testing and CI/CD pipeline


