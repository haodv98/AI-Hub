# NestJS API policy — read-only access to provider keys and internal secrets
path "secret/data/aihub/providers/*" {
  capabilities = ["read"]
}

path "secret/data/aihub/internal/*" {
  capabilities = ["read"]
}
