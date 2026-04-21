/**
 * k6 Load Test — AIHub Gateway
 * Target: < 50ms p99 overhead (excluding provider call time)
 * Run: k6 run scripts/loadtest/gateway.js
 *
 * Prerequisites:
 *   - Full dev stack running (make dev)
 *   - Valid test API key set in AIHUB_TEST_KEY env var
 *   - LiteLLM mock mode or stubbed provider
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const gatewayLatency = new Trend('gateway_latency_ms');
const gatewayErrors = new Counter('gateway_errors');

export const options = {
  vus: 50,           // 50 virtual users
  duration: '60s',   // run for 60 seconds
  thresholds: {
    'gateway_latency_ms': ['p(99)<50'],   // p99 < 50ms (auth + policy + rate limit overhead only)
    'http_req_duration': ['p(95)<200'],   // full request p95 < 200ms
    'http_req_failed': ['rate<0.01'],     // <1% error rate
  },
};

const BASE_URL = __ENV.GATEWAY_URL || 'http://localhost:9080';
const TEST_KEY = __ENV.AIHUB_TEST_KEY || '';

export default function () {
  const payload = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 1,
  });

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${TEST_KEY}`,
  };

  const start = Date.now();
  const res = http.post(`${BASE_URL}/v1/chat/completions`, payload, { headers, timeout: '10s' });
  const latency = Date.now() - start;

  gatewayLatency.add(latency);

  const ok = check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
    'has X-AIHub-Model header': (r) => !!r.headers['X-Aihub-Model'],
  });

  if (!ok) {
    gatewayErrors.add(1);
  }

  sleep(1);
}
