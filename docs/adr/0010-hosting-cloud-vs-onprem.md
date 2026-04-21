# ADR-0010: Hosting — On-Premises First, Cloud Migration Later

**Date**: 2026-04-17
**Status**: accepted
**Deciders**: CTO Office

## Context

AIHub infrastructure cần deploy trên môi trường phù hợp. Data governance của công ty yêu cầu dữ liệu AI usage (metadata, employee data) không được đưa ra ngoài nội bộ trong giai đoạn đầu. Tuy nhiên, cần giữ khả năng migrate lên cloud sau này khi scale.

## Decision

**Phase 1–3 (Weeks 1–10): On-Premises**
- Docker Compose cho local development
- Docker Compose hoặc Kubernetes (bare metal) cho production on-prem
- Infrastructure sẵn có trong công ty

**Phase 4+ (Weeks 11+): Cloud Migration path**
- Thiết kế containers để cloud-portable ngay từ đầu
- Không dùng on-prem-specific features
- Migration target: AWS (EKS + RDS + ElastiCache) hoặc GCP (GKE + Cloud SQL + Memorystore)

**Exception: AWS CloudWatch cho logs**
- Dù infrastructure là on-prem, logs được export ra AWS CloudWatch (per ADR-0011)
- Đây là one-directional data flow: metadata logs chỉ ra ngoài, không có sensitive data

## Alternatives Considered

### Alternative 1: Cloud ngay từ đầu
- **Pros**: Managed services, auto-scaling, less ops burden
- **Cons**: Data governance concern, phụ thuộc internet connectivity cho critical gateway path
- **Why not**: Data policy yêu cầu on-prem trong giai đoạn đầu

### Alternative 2: Hybrid (on-prem gateway + cloud admin portal)
- **Pros**: Gateway ở on-prem (low latency), admin portal ở cloud (accessibility)
- **Cons**: Phức tạp hóa networking, 2 environments khó maintain
- **Why not**: Over-engineering cho scale 50–100 users

## Consequences

### Positive
- Data sovereignty: employee data và AI usage metadata trong mạng nội bộ
- Không phụ thuộc internet cho critical AI request path
- Cost savings: dùng hardware sẵn có

### Negative
- Ops burden: team phải tự maintain servers, backups, networking
- Scaling manual: thêm capacity = thêm hardware
- Less managed services: PostgreSQL, Redis self-hosted thay vì managed

### Cloud-Portability Rules (PHẢI tuân thủ ngay từ đầu)
- Dùng Docker containers cho mọi service (không install trực tiếp trên host)
- Không dùng local file system cho persistent data (dùng volumes)
- Config qua environment variables (12-factor app)
- Không hardcode IP addresses
- Database: standard PostgreSQL (tương thích RDS/Cloud SQL)
- Secrets: Vault (tương thích với cloud secret managers sau này)
