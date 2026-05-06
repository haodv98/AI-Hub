# QA Report: TASK-443 — Prometheus Metrics for Provider Adapter Layer

**Date:** 2026-05-06  
**Status:** DONE  
**Reviewer:** Claude Code + code-reviewer agent

---

## Summary

Added 7 new Prometheus metrics to the Provider Adapter Layer. All metrics use the single shared `Registry` in `MetricsService`, ensuring they appear at the existing `/metrics` endpoint.

---

## Metrics Implemented

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `aihub_alias_resolution_total` | Counter | alias, resolved_provider, matched_scope, status | Alias resolutions (success/error) |
| `aihub_alias_resolution_duration_seconds` | Histogram | alias | Alias resolution latency (always observed, even on error) |
| `aihub_adapter_forward_total` | Counter | provider, model, status | Adapter forward calls by outcome |
| `aihub_adapter_forward_duration_seconds` | Histogram | provider, model | Adapter forward latency (TTFB for streaming) |
| `aihub_combo_attempt_total` | Counter | combo, model, hop, status | Per-hop combo attempts |
| `aihub_combo_fallback_total` | Counter | combo | Fallbacks triggered (move to next model) |
| `aihub_format_translation_total` | Counter | from_format, to_format | Format translations (counted after success only) |

Histogram buckets (all): `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]` seconds.

---

## Files Modified

| File | Change |
|------|--------|
| `api/src/modules/metrics/metrics.service.ts` | +7 private metrics, +7 public methods, added `status` label to aliasResolutionTotal |
| `api/src/modules/model-router/model-router.module.ts` | Import MetricsModule |
| `api/src/modules/model-router/model-router.service.ts` | Inject MetricsService, instrument resolveAlias with try/catch/finally |
| `api/src/modules/provider-adapter/provider-adapter.module.ts` | Import MetricsModule |
| `api/src/modules/provider-adapter/provider-adapter.service.ts` | Inject MetricsService, instrument forward with finally for duration, record format translations after success |
| `api/src/modules/provider-adapter/provider-combo.service.ts` | Inject MetricsService, record combo attempt/fallback per hop |

---

## Test Results

| Check | Result |
|-------|--------|
| `tsc --noEmit` | PASS — 0 errors |
| `jest gateway.service.spec` | PASS — 29/29 |
| `jest provider-adapter + model-router + format-translator` | PASS — 23/23 |

---

## Audit Findings & Resolutions

### Fixed (HIGH)

| Finding | Fix Applied |
|---------|-------------|
| `observeAdapterForwardDuration` not called on error path | Moved to `finally` block — always observed |
| `recordFormatTranslation` called before `translateRequest` succeeds | Moved call to after successful translation |
| `resolveAlias` error path skipped all metrics | Added try/catch/finally; added `status` label to counter |

### Known Limitations

| Issue | Severity | Notes |
|-------|----------|-------|
| `alias` label high-cardinality risk | MEDIUM | In practice bounded by valid model IDs. Recommend adding normalization/allow-list in a follow-up if cardinality exceeds 100 unique values in Prometheus. |
| `model` label high-cardinality risk on Histograms | MEDIUM | Same as above. Consider removing `model` label from `adapterForwardDurationS` if cardinality is an issue in prod. |
| Streaming duration = TTFB only | MEDIUM | Documented in `help` string comment. Metric name intentionally broad; add `_ttfb` suffix variant if distinction matters for alerting. |
| `hop` label unbounded | LOW | Bounded by combo model list size. Acceptable for current scale. |

---

## Recommended Alerts (for TASK-444)

```yaml
# Alias error rate > 5%
sum(rate(aihub_alias_resolution_total{status="error"}[5m])) /
sum(rate(aihub_alias_resolution_total[5m])) > 0.05

# Adapter error rate > 5% (critical)
sum(rate(aihub_adapter_forward_total{status="error"}[5m])) /
sum(rate(aihub_adapter_forward_total[5m])) > 0.05

# Combo fallback rate > 10% (warning)
sum(rate(aihub_combo_fallback_total[5m])) /
sum(rate(aihub_combo_attempt_total[5m])) > 0.10
```

---

## Next Tasks

- **TASK-444**: Grafana dashboards (depends on TASK-443 — now unblocked)
- **TASK-445**: Contract test smoke runner
- **TASK-446**: E2E streaming test
