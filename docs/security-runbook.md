# Security Review & Pentest Preparation

## Attack Surface
- **Edge**: APISix public ingress with route-level controls.
- **API**: NestJS services on internal network behind gateway.
- **Portal**: React admin UI protected by Keycloak bearer tokens.

## Baseline Verification
- [x] Helmet enabled with deny-frame, no-sniff, strict referrer policy, and HSTS.
- [x] Production CORS origin is constrained to `PORTAL_ORIGIN`.
- [x] HR webhook requires HMAC signature and raw-body validation.
- [x] API key policy: hash-only storage, one-time plaintext reveal.
- [x] Logging policy: metadata-only by default (ADR-0011).

## Pentest Checklist
1. Brute force simulation against API keys with rate-limit validation.
2. Injection tests for all query/body params on high-risk endpoints.
3. Authorization checks for role boundaries (`it_admin`, `team_lead`, `member`).
4. Verify unauthenticated surface is limited to health and approved public routes.
5. Replay attempts against one-time token and webhook dedup keys.

## Emergency Controls
- Keep break-glass local Keycloak admin account active.
- Maintain VPN allowlist rollback procedure for APISix restriction changes.
- Predefine incident channel and escalation contacts for P1 events.
