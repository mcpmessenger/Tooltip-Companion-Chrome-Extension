# ECS Capacity Review Checklist (Operation Juicebox)

Run this checklist after incidents involving 502s, timeouts, or task instability.

## 1. Task Definition

- [ ] Memory (MiB) and CPU units sized for Playwright workloads (baseline 4096 MiB / 2048 CPU)
- [ ] `ulimits` configured for file descriptors (Playwright spawns many handles)
- [ ] Environment variables set (OPENAI_API_KEY, SCREENSHOT_DIR, SCREENSHOT_URL_BASE)
- [ ] Health check grace period ≥ 60s to allow browser warm-up

## 2. Service Scaling

- [ ] Desired count >= 2 tasks (enables zero-downtime deployments)
- [ ] Target tracking or step scaling policy in place
- [ ] Max capacity ≥ 3x baseline traffic

## 3. Platform Checks

- [ ] ALB target group health: routing correctly to tasks and reporting healthy
- [ ] Security groups allow ALB ➜ task (port 3000) and task ➜ outbound HTTPS
- [ ] IAM task role grants CloudWatch Logs, S3 (if screenshot storage) access

## 4. Instrumentation

- [ ] CloudWatch Logs retention >= 14 days
- [ ] CloudWatch Alarms deployed from `cloudwatch-alarms.yml`
- [ ] Dashboards/alerts wired to Slack, PagerDuty, or email

## 5. Post-Review Notes

- [ ] Incident summary captured in `docs/operations-log.md` (create if missing)
- [ ] Action items assigned with owner + due date


