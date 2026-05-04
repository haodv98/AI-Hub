# Production Kubernetes (on-prem bare-metal)

## Apply order

1. Namespace: `kubectl apply -f namespace.yaml`
2. ConfigMaps + Deployments + Services: `kubectl apply -f .`
3. Create `aihub-prod-core` and `aihub-backup-secrets` secrets (see `secrets.example.yaml` and `backup-cronjob.yaml` references).
4. Map `aihub-backup-script` ConfigMap from `infra/backup/` (or your ops pipeline) before CronJob succeeds.

## Ingress / TLS

Ingress manifests are intentionally omitted (cluster-specific). Point your edge (APISix / cloud LB) at `Service` `aihub-api` and `aihub-web` ports.

## CI

GitHub Actions `deploy-production.yml` runs `kubectl apply -f infra/k8s/production/` then `kubectl set image` for rolling updates.
