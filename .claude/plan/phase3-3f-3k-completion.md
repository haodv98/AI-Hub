# Implementation Plan: Phase 3 Completion (3F -> 3K, Excluding LDAP)

## Task Type
- [ ] Frontend (-> Gemini)
- [ ] Backend (-> Codex)
- [x] Fullstack (-> Parallel)

## Technical Solution
Complete Phase 3 by executing a dependency-gated rollout across six workstreams: RBAC hardening, security hardening, monitoring/alerting, production infrastructure, batch onboarding, and operations documentation.  
Explicitly exclude `TASK-350` (Keycloak LDAP/AD sync) and replace its gating effect with a temporary local-auth fallback and RBAC verification controls (`TASK-351`, `TASK-342`, `TASK-364`).  
Use stop-loss gates between workstreams: no downstream execution until current gate passes objective checks (tests, runbooks, dashboards, smoke checks, and restore drills).

## Implementation Steps
1. **Scope lock and dependency freeze** - Confirm execution scope is `TASK-341,342,351,360-364,370-375,380-383,390,391,395` and explicitly skip `TASK-350`; update exit criteria interpretation for Phase 3 sign-off.
2. **Stabilize HR integration completion (3E tail)** - Finish `TASK-341` mapping config hardening + `TASK-342` webhook integration tests to guarantee onboarding lifecycle reliability before scale rollout.
3. **RBAC production hardening gate (3F partial)** - Execute `TASK-351` controller/guard audit and role-based integration tests; verify only allowed unauthenticated routes remain (`/health`, gateway public surface).
4. **Security baseline gate (3G foundational)** - Implement `TASK-360` security headers and `TASK-361` APISix IP allowlist in staging; validate no operator lockout via VPN and break-glass admin access.
5. **Audit integrity gate (3G completion)** - Complete `TASK-362` audit-log completeness checklist and `TASK-363` audit viewer page; then run `TASK-364` security review + pentest preparation runbook.
6. **Observability foundation (3H step 1)** - Deliver `TASK-370` scrape config + `TASK-371` custom app metrics, confirm metrics cardinality boundaries and p99 latency SLO instrumentation.
7. **Observability operations (3H step 2)** - Deliver `TASK-372` dashboards + `TASK-373` alert rules with tuned thresholds to avoid alert fatigue; add runbook links in every critical alert.
8. **Log pipeline hardening (3H step 3)** - Complete `TASK-374` Loki/Promtail and `TASK-375` CloudWatch exporter while re-verifying ADR-0011 (no prompt/response content leakage).
9. **Production platform readiness (3I step 1)** - Implement `TASK-380` K8s manifests and `TASK-381` staging compose parity, then run environment drift checks between staging and prod profiles.
10. **Deployment automation and rollback (3I step 2)** - Implement `TASK-382` staged CI/CD pipelines with manual production approval gates and automatic smoke-check rollback path.
11. **Backup and disaster-readiness gate (3I step 3)** - Implement `TASK-383` encrypted backup CronJob; perform mandatory restore drill before allowing batch onboarding.
12. **Rollout operations enablement (3J)** - Prepare `TASK-390` onboarding materials and execute `TASK-391` 7-team batch onboarding with 48h hypercare after each batch.
13. **Operational documentation closeout (3K)** - Complete `TASK-395` runbook and align it with actual dashboards/alerts/escalations created in 3G-3J.
14. **Phase-3 stop-loss final gate** - Validate all applicable exit criteria (excluding LDAP sync criterion) with evidence bundle: test reports, dashboard snapshots, alert tests, backup restore proof, and onboarding adoption metrics.

## Pseudo-code (Execution Orchestration)
```ts
type Gate =
  | "hr_ready"
  | "rbac_ready"
  | "security_ready"
  | "observability_ready"
  | "infra_ready"
  | "backup_restore_ready"
  | "onboarding_ready"
  | "docs_ready";

async function runPhase3Plan(ctx: Context) {
  await runTasks(["TASK-341", "TASK-342"]);
  assertGate("hr_ready", await verifyHrLifecycleTests(ctx));

  await runTasks(["TASK-351"]);
  assertGate("rbac_ready", await verifyRbacCoverage(ctx));

  await runTasks(["TASK-360", "TASK-361", "TASK-362", "TASK-363", "TASK-364"]);
  assertGate("security_ready", await verifySecurityChecklist(ctx));

  await runTasks(["TASK-370", "TASK-371", "TASK-372", "TASK-373", "TASK-374", "TASK-375"]);
  assertGate("observability_ready", await verifyMonitoringAndLogging(ctx));

  await runTasks(["TASK-380", "TASK-381", "TASK-382", "TASK-383"]);
  assertGate("infra_ready", await verifyProdInfraReadiness(ctx));
  assertGate("backup_restore_ready", await verifyRestoreDrill(ctx));

  await runTasks(["TASK-390", "TASK-391"]);
  assertGate("onboarding_ready", await verifyOnboardingAdoption(ctx));

  await runTasks(["TASK-395"]);
  assertGate("docs_ready", await verifyRunbookCompleteness(ctx));
}

function assertGate(name: Gate, pass: boolean) {
  if (!pass) throw new Error(`STOP_LOSS: ${name} failed; do not proceed`);
}
```

## Key Files
| File | Operation | Description |
|------|-----------|-------------|
| `tasks/phase3-rollout.md` | Modify | Track completion state and annotate LDAP-excluded sign-off logic |
| `api/src/modules/integrations/hr/hr-mapping.config.ts` | Modify | Finalize mapping rules and env override handling (`TASK-341`) |
| `api/src/modules/integrations/hr/hr.controller.spec.ts` | Modify | Add full webhook integration suite (`TASK-342`) |
| `api/src/common/guards/` | Modify | RBAC guard hardening and edge-case handling (`TASK-351`) |
| `api/src/modules/**/*.controller.ts` | Modify | Authorization coverage audit and role decorators (`TASK-351`) |
| `api/src/main.ts` | Modify | Helmet + CORS hardening (`TASK-360`) |
| `infra/apisix/conf/config.yaml` | Modify | APISix IP allowlist plugin config (`TASK-361`) |
| `docs/audit-checklist.md` | Add/Modify | Audit completeness verification artifacts (`TASK-362`) |
| `web/src/pages/AuditLog.tsx` | Add/Modify | Audit log viewer implementation (`TASK-363`) |
| `docs/security-runbook.md` | Add/Modify | Security review and pentest readiness (`TASK-364`) |
| `infra/prometheus/prometheus.yml` | Modify | Scrape jobs and intervals (`TASK-370`) |
| `api/src/modules/metrics/metrics.module.ts` | Add/Modify | Custom Prometheus metrics (`TASK-371`) |
| `infra/grafana/dashboards/` | Add/Modify | Dashboard provisioning JSON (`TASK-372`) |
| `infra/prometheus/rules/alerts.yml` | Modify | Alert thresholds and routing (`TASK-373`) |
| `infra/loki/`, `infra/promtail/config.yml` | Add/Modify | Centralized logging setup (`TASK-374`) |
| `infra/cloudwatch/cloudwatch-agent-config.json` | Add/Modify | CloudWatch export config (`TASK-375`) |
| `infra/k8s/` | Add/Modify | Production manifests and policies (`TASK-380`) |
| `infra/docker-compose.staging.yml` | Add/Modify | Staging parity environment (`TASK-381`) |
| `.github/workflows/deploy-staging.yml` | Add/Modify | Staging deployment workflow (`TASK-382`) |
| `.github/workflows/deploy-production.yml` | Add/Modify | Production deployment workflow with approvals (`TASK-382`) |
| `infra/backup/backup.sh` | Add/Modify | Encrypted backup script (`TASK-383`) |
| `infra/k8s/backup-cronjob.yaml` | Add/Modify | Daily backup job + retention flow (`TASK-383`) |
| `docs/onboarding-deck.md` | Add/Modify | Batch onboarding operation guide (`TASK-390`) |
| `docs/runbook.md` | Add/Modify | Complete admin runbook (`TASK-395`) |

## Risks and Mitigation
| Risk | Mitigation |
|------|------------|
| LDAP excluded may leave identity gap in Phase-3 criteria | Treat LDAP as deferred scope item with explicit exception note and fallback local admin access controls |
| RBAC drift across many controllers | Add role matrix test suite and endpoint inventory audit before release |
| Security headers / allowlist accidentally block legit traffic | Stage-first rollout, canary CIDR validation, emergency allowlist override procedure |
| Alert fatigue from poor thresholds | Start with warning+critical tiers, tune using first-week baseline telemetry |
| K8s manifest complexity causes rollout instability | Enforce smoke tests, readiness probes, and rollback automation in pipeline |
| Backup exists but restore fails | Mandatory restore drill evidence before onboarding wave begins |
| Onboarding surge overloads support channel | Batch schedule + 48h hypercare + predefined escalation runbook |

## Model Collaboration Notes
- `ace-tool` MCP was not available in this environment; context retrieval used local graph + repo artifacts.
- `GEMINI_API_KEY` is set in current shell, but Gemini wrapper still hit provider quota limits during analysis retries.
- Codex wrapper session started but exited early with non-zero status before returning analysis content.

## SESSION_ID (for /ccg:execute use)
- CODEX_SESSION: `019db875-0fd9-7693-b7b3-386d409e9a6f` (startup session captured; analysis output unavailable due wrapper exit)
- GEMINI_SESSION: `52302d5b-dddd-4375-aadd-c07efc1fb924` (session active; retries blocked by quota)

