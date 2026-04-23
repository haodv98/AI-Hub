# AIHub Operations Runbook

## High 5xx Error Rate
1. Check API pod health and recent deploy.
2. Inspect APISix upstream status and timeout metrics.
3. Validate dependency reachability: PostgreSQL, Redis, Vault, LiteLLM.
4. Roll back latest release if error rate remains above 5% for 10 minutes.

## Gateway Latency Spike
1. Open Grafana gateway dashboard and compare p95/p99 with baseline.
2. Identify dominant provider/model labels in latency histogram.
3. Check Redis and DB saturation metrics.
4. Apply fallback model policy if provider latency is degraded.

## Backup Job Failure
1. Inspect backup CronJob logs for `pg_dump`/encryption/transfer errors.
2. Validate NAS/S3 connectivity and credentials.
3. Trigger manual backup run.
4. Confirm restore drill can list backup contents with `pg_restore --list`.

## Security Incident (Key Leak Suspicion)
1. Revoke affected internal keys immediately.
2. Rotate related provider keys if exposure boundary is unclear.
3. Pull audit timeline by actor, target, and timestamp window.
4. Notify incident channel and start postmortem record.
