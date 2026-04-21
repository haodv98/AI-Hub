# ADR-0011: Logging Policy — 3-Mode Logging + AWS CloudWatch + Daily DB Backup

**Date**: 2026-04-17
**Status**: accepted
**Deciders**: CTO Office

## Context

Gateway xử lý mọi AI request. Cần quyết định: log gì, bao nhiêu, lưu ở đâu? Có 2 competing concerns: observability (debug issues, audit) vs. privacy (không log prompt/response content). Đồng thời cần database backup strategy.

## Decision

### Logging: 3-Mode System

| Mode | Log Level | Nội dung |
|------|-----------|----------|
| **Info** | INFO | Metadata: user_id, team_id, model, input_tokens, output_tokens, latency_ms, status_code, estimated_cost. Request ID. Timestamp. |
| **Error** | ERROR | Tất cả INFO fields + error message, stack trace (server-side only). Provider error response (sanitized). |
| **Debug** | DEBUG | Tất cả ERROR fields + request headers, policy resolution steps, budget counter values, rate limit state. KHÔNG bao gồm prompt/response content. |

**Default mode: INFO** — metadata only, KHÔNG log prompt/response content theo bất kỳ mode nào.

**Log format**: Structured JSON (log fields dễ parse bởi CloudWatch Insights).

```json
{
  "timestamp": "2026-04-17T10:30:00Z",
  "level": "INFO",
  "request_id": "req_abc123",
  "user_id": "uuid",
  "team_id": "uuid",
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "input_tokens": 1500,
  "output_tokens": 800,
  "latency_ms": 1234,
  "estimated_cost_usd": 0.017,
  "status_code": 200,
  "fallback_applied": false,
  "service": "gateway"
}
```

### Log Export: AWS CloudWatch

Dù infrastructure là on-prem (ADR-0010), logs được export tới AWS CloudWatch:

```
On-Prem Services → Promtail/CloudWatch Agent → AWS CloudWatch Logs
                                                     ↓
                                            CloudWatch Insights (query)
                                            CloudWatch Alarms (alerting)
```

**Retention policy:**
- CloudWatch: INFO logs 90 ngày, ERROR logs 12 tháng
- Local Loki (on-prem): 30 ngày (buffer trước khi export)
- Audit logs (DB): 24 tháng (không export, ở trong DB)

**Security:** Chỉ export metadata logs (không có prompt/response content). IAM role với Write-only permission tới CloudWatch.

### Database Backup: Daily Job (24h)

```
Cron: 02:00 AM daily
Steps:
  1. pg_dump → compressed backup file
  2. Encrypt với AES-256 (key trong Vault)
  3. Copy tới backup storage (local NAS + optional S3)
  4. Verify backup integrity (pg_restore --dry-run)
  5. Cleanup backups older than 30 days
  6. Log backup result (success/failure) → CloudWatch
```

**Retention:** 30 ngày daily backups, 12 tháng monthly snapshots (1st of month).

## Alternatives Considered

### Alternative 1: Log everything (content + metadata)
- **Pros**: Complete audit trail, forensic capability
- **Cons**: Privacy concern, storage cost (prompts có thể rất lớn), GDPR risk
- **Why not**: Không cần thiết cho business goals. Metadata đủ cho cost tracking và debugging.

### Alternative 2: Chỉ dùng Loki on-prem (không CloudWatch)
- **Pros**: Không có external dependency
- **Cons**: Team phải maintain Loki infrastructure, query/alerting kém hơn CloudWatch Insights
- **Why not**: CloudWatch Insights + Alarms cung cấp better observability với less ops overhead

## Consequences

### Positive
- CloudWatch Insights: SQL-like log queries không cần setup Kibana/Grafana logging stack
- CloudWatch Alarms: real-time alert trên error rates, latency anomalies
- Daily backup với verification: high confidence trong data durability
- 3-mode logging: Debug mode useful trong incident response mà không cần redeploy

### Negative
- AWS cost cho CloudWatch Logs ingestion (~$0.50/GB, ước tính $5–20/tháng)
- External dependency (AWS) dù infrastructure là on-prem
- Backup encryption key management (Vault required)

### Risks
- CloudWatch connectivity lost: Mitigation: buffer trong Loki (30 ngày), CloudWatch Agent retry
- Backup job fails silently: Mitigation: alert nếu backup job không complete trong 2h. Verify step trong job.
