# Implementation Plan: Phase 3 Rollout - Replace Slack with Company SMTP

## Scope
- Update Phase 3 planning artifacts to replace Slack-based notifications and key delivery with SMTP mail server workflows.
- Keep current architecture constraints: Vault-managed secrets, no plaintext key storage, metadata-only logging, on-prem operations.
- Planning-only output: no production code changes in this plan.

## Task Type
- [ ] Frontend (-> Gemini)
- [ ] Backend (-> Codex)
- [x] Fullstack (-> Parallel)

## Technical Solution
Use a dedicated `EmailModule` (SMTP + queue + templating) as the notification channel for alerts, monthly reports, and onboarding/key-delivery communication.  
For key distribution, avoid sending plaintext key directly by email; send a one-time secure portal link (TTL 24h) for single-view reveal.  
Integrate delivery status + failure metadata into audit-friendly records and route operational incidents to a company mailing list instead of Slack channels.

## Implementation Steps
1. **Planning baseline update** - Replace all Slack-specific tasks in Phase 3 with SMTP email integration tasks and aligned dependencies.
2. **SMTP integration definition** - Define transport settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`) and Vault storage contract.
3. **Delivery architecture** - Define queue-driven async delivery model (BullMQ) with retry/backoff and dead-letter handling.
4. **Template contract** - Define standard templates (`budget_alert`, `team_budget_alert`, `key_rotation_reminder`, `monthly_report_ready`, `onboarding_key_delivery`) and payload schemas.
5. **Alert/report integration mapping** - Replace Slack calls in alert/report workflows with email service contracts and recipient groups.
6. **Secure key handoff flow** - Replace DM plaintext model with tokenized one-time portal reveal link + expiry + fallback flow.
7. **HR onboarding alignment** - Update `employee.onboarded` process to trigger onboarding email and secure key-reveal flow.
8. **Ops alert routing update** - Replace Slack channel escalation with distribution lists (`AIHUB_OPS_EMAILS`, support mailbox).
9. **Exit criteria revision** - Swap Slack bot outcomes with SMTP pipeline readiness and email delivery SLO checks.
10. **Validation checklist** - Confirm task dependency graph remains valid and no references to Slack remain in Phase 3 tasks.

## Pseudo-code (Planning Draft)
```ts
// Notification abstraction used by Reports/Alerts/HR flows
interface NotificationService {
  sendToUser(userId: string, template: TemplateId, payload: Record<string, unknown>): Promise<void>;
  sendToGroup(group: string, template: TemplateId, payload: Record<string, unknown>): Promise<void>;
}

// SMTP-backed implementation
class EmailService implements NotificationService {
  async sendToUser(userId, template, payload) {
    const user = await usersRepo.findById(userId);
    await queue.enqueue("email.send", { to: user.email, template, payload });
  }
}

// Key delivery: never email plaintext directly
async function sendOnboardingKeyDelivery(userId: string, keyId: string) {
  const token = await oneTimeTokenService.issue({
    subject: userId,
    purpose: "key_reveal",
    resourceId: keyId,
    ttlHours: 24
  });

  await emailService.sendToUser(userId, "onboarding_key_delivery", {
    revealUrl: `${portalBaseUrl}/keys/reveal?token=${token}`,
    expiresInHours: 24
  });
}
```

## Key Files
| File | Operation | Description |
|------|-----------|-------------|
| `tasks/phase3-rollout.md` | Modify | Replace Slack tasks/notes/dependencies/exit criteria with SMTP-based equivalents |
| `tasks/index.md` | Modify | Update Phase 3 summary from Slack to SMTP email notifications |
| `.claude/plan/phase3-smtp-rollout.md` | Create | Canonical implementation plan for `/ccg:execute` handoff |

## Risks and Mitigation
| Risk | Mitigation |
|------|------------|
| SMTP misconfig causes dropped notifications | Use Vault-managed credentials, startup healthcheck, retry + dead-letter queue |
| Email delivery latency during bursts | Queue + backoff + provider throttling controls |
| Key exposure via email content | Never send plaintext key; one-time reveal token with short TTL |
| Undetected mail failures (bounce/reject) | Persist delivery status, alert IT admins, fallback to portal/manual handoff |
| Operational continuity regression from Slack removal | Define mailing-list based escalation and report-delivery runbook updates |

## Validation Checklist
- [x] No Slack references remain in `tasks/phase3-rollout.md` scope for notifications/key delivery.
- [x] Dependencies for TASK-320/321/332/333/334/340 form a valid chain.
- [x] Exit criteria reflect SMTP pipeline readiness instead of Slack bot readiness.
- [x] Security constraints from ADR-0008 and ADR-0011 remain satisfied.

## SESSION_ID (for /ccg:execute use)
- CODEX_SESSION: `019db81b-b5da-7330-886c-af30821d84ea` (analysis session started; still running in background at planning cut-off)
- GEMINI_SESSION: `N/A` (Gemini run failed: missing `GEMINI_API_KEY`)
