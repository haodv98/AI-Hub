# Plan: AIHub — Implementation Task Breakdown

**Generated**: 2026-04-17
**Status**: Draft — pending CTO review for pending decisions

## Summary

Phân tích ADRs và docs để tạo task breakdown hoàn chỉnh cho 4 phases.

## Technical Solution

Architecture: Gateway-Centric (ADR-0001), 40:60 Build/Buy (ADR-0007).
Stack: LiteLLM + PostgreSQL/TimescaleDB + Redis + Vault + React + (Go|Python TBD).

## Task Files

| File | Tasks |
|------|-------|
| `tasks/index.md` | Legend, critical path, blocked tasks, parallelism |
| `tasks/phase1-foundation.md` | ~40 tasks: Infra, DB migrations, Gateway, Auth, Key Mgmt |
| `tasks/phase2-mvp.md` | ~30 tasks: Policy Engine, Admin Portal, Pilot |
| `tasks/phase3-rollout.md` | ~25 tasks: Rollout, Slack, HR, SSO, Monitoring |
| `tasks/phase4-optimization.md` | ~22 tasks: Cost optimization, Analytics, Advanced features |
| `tasks/cross-cutting.md` | Ongoing: Testing, Documentation, Decision follow-ups |

## Critical Blocker

**D2 (Backend Language: Go vs Python) PHẢI resolve trước Week 1 Day 1.**
~50 backend tasks bị block bởi decision này.

## Risks

| Risk | Mitigation |
|------|-----------|
| D2 unresolved | Bắt đầu language-agnostic tasks (migrations, infra, frontend) trong khi chờ |
| LiteLLM breaking changes | Pin version, test trước upgrade |
| Gateway latency > 50ms p99 | Benchmark ở Phase 1 Week 2, trigger Kong migration nếu cần |
| Provider API changes | Abstraction layer (ADR-0001) absorbs change |

## SESSION_ID

- CODEX_SESSION: N/A (used architect subagent)
- GEMINI_SESSION: N/A (used architect subagent)
