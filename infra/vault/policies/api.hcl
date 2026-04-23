# NestJS API policy — read/write for provider key resolution + assignment
path "kv/data/aihub/providers/*/shared" {
  capabilities = ["read"]
}

path "kv/data/aihub/providers/*/users/*" {
  capabilities = ["read", "create", "update"]
}

# KV v2 UI/list support: allow browsing provider/user secret trees in metadata endpoints
path "kv/metadata/aihub/providers/*" {
  capabilities = ["read", "list"]
}

path "kv/metadata/aihub/providers/*/users" {
  capabilities = ["read", "list"]
}

path "kv/metadata/aihub/providers/*/users/*" {
  capabilities = ["read", "list"]
}

path "kv/data/aihub/internal/*" {
  capabilities = ["read"]
}
