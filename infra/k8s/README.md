# Kubernetes manifests

- **`staging/`** — namespace `aihub-staging`, API + Web Deployments/Services. Applied by `.github/workflows/deploy-staging.yml`.
- **`production/`** — namespace `aihub-prod`, API + Web, daily DB backup CronJob. Applied by `.github/workflows/deploy-production.yml`.

Before first deploy, create application secrets out-of-band (do not commit):

```bash
kubectl create namespace aihub-staging --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic aihub-staging-core -n aihub-staging \
  --from-literal=database_url='postgresql://...' \
  --from-literal=redis_url='redis://...' \
  --from-literal=vault_token='...'
```

Repeat pattern for `aihub-prod` / `aihub-staging-core` vs `aihub-prod-core` naming — see `secrets.example.yaml` in each folder.

CI replaces image tags via `kubectl set image` after `kubectl apply`.
