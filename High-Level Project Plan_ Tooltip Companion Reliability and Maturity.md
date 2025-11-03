## High-Level Project Plan: Tooltip Companion Reliability and Maturity

This plan outlines a phased approach to address the key risks and gaps identified in the Project Assessment for the Tooltip Companion Chrome Extension. The primary goal is to transition the project to a production-grade state by enhancing reliability, security, and development practices.

The plan is structured into four sequential phases, prioritizing immediate stability and observability before moving to advanced compatibility, automation, and long-term strategy.

### Phase 1: Backend Stabilization and Observability

**Goal:** Eliminate the root causes of frequent 502/timeout errors and establish foundational monitoring for the backend service.

| Objective | Key Deliverables | Rationale |
| :--- | :--- | :--- |
| **1.1 Implement Health Checks & Alarms** | CloudWatch Alarms configured for ECS Service (CPU, Memory, Request Count, Error Rate). PagerDuty/Notification integration for critical alerts. | Ensures immediate detection of service degradation and outages, addressing the "outages linger undetected" risk. |
| **1.2 Establish Log Aggregation** | Centralized logging solution (e.g., CloudWatch Logs Insights or ELK stack) for both the Playwright service and the extension's error logs. | Enables efficient diagnosis of 502s and other backend issues, replacing manual script-based debugging. |
| **1.3 Introduce Backend Resilience** | Automatic retries with exponential backoff in the backend fetcher. Implementation of a circuit breaker pattern for upstream blocks (403/timeout). | Mitigates transient network issues and prevents cascading failures when external sites block requests. |
| **1.4 Optimize ECS Configuration** | Review and tune ECS container memory/CPU limits and scaling policies. | Addresses potential resource exhaustion leading to 502 spikes. |

### Phase 2: Reliability and Compatibility

**Goal:** Proactively address Content Security Policy (CSP) issues and strengthen the security posture of the screenshot service.

| Objective | Key Deliverables | Rationale |
| :--- | :--- | :--- |
| **2.1 CSP Fallback Implementation** | Content script logic to detect blocked external image sources. Backend modification to serve screenshots as Base64 data URLs upon detection. | Resolves the "false 'backend issues' messages" and improves reliability on financial and high-security sites. |
| **2.2 Secure Screenshot Endpoint** | Gate the `/screenshot/:token` endpoint behind signed URLs or short-lived presigned links. | Addresses the critical security gap of a publicly accessible screenshot endpoint with no authentication or rate limiting. |
| **2.3 Security Review and Hardening** | Review OWASP controls, focusing on rate limiting and input validation for all backend endpoints. Document and enforce a data-retention policy for stored screenshots. | Enhances overall security and compliance, reducing exposure from public tokens and unmanaged data. |

### Phase 3: Quality Assurance and Automation

**Goal:** Implement a robust testing and deployment pipeline to prevent regressions and ensure environment parity.

| Objective | Key Deliverables | Rationale |
| :--- | :--- | :--- |
| **3.1 Automated Testing Suite** | **Backend Integration Tests:** (Playwright capture, OCR, MCP flow). **Extension Smoke Tests:** (Puppeteer/Playwright with Chrome extension loader). **Regression Test:** For the new CSP fallback mechanism. | Addresses the "no automated tests" gap, ensuring new features and fixes do not introduce regressions. |
| **3.2 CI/CD Pipeline Implementation** | GitHub Actions (or CodeBuild) workflow for linting, testing, extension build, Docker build/push, and ECS deployment. | Replaces manual, error-prone deployments with a reliable, repeatable, and auditable process. |
| **3.3 Staging Environment** | Creation of a staging environment that mirrors production for pre-deployment validation. | Provides a safe space for testing new features and complex changes before they impact end-users. |

### Phase 4: Documentation and Long-Term Strategy

**Goal:** Consolidate operational knowledge and define a roadmap for future scalability and feature development.

| Objective | Key Deliverables | Rationale |
| :--- | :--- | :--- |
| **4.1 Comprehensive Operations Guide** | A single "Operations Guide" covering deployment, monitoring, 502 fixes, CSP fallback behavior, and emergency runbooks. | Creates a single source of truth for operational knowledge, reducing reliance on tribal knowledge and simplifying onboarding. |
| **4.2 Architecture Diagram** | Visual representation of the extension ↔ backend ↔ AWS resources flow. | Clarifies the system architecture for developers and operators. |
| **4.3 User-Facing Telemetry** | Implement a status indicator or retry message in the extension when screenshots fail due to site policy. | Improves user experience and trust by providing transparency when issues occur. |
| **4.4 Long-Term Scalability Review** | Assessment of serverless screenshot capture (e.g., AWS Lambda) and integration of a lightweight analytics dashboard for success/failure monitoring. | Prepares the project for future growth and allows for data-driven decision-making. |

This plan provides a clear, actionable roadmap to achieve production-grade reliability and maturity for the Tooltip Companion project. Please let me know which specific objective you would like to tackle first, and I can begin the detailed execution.
