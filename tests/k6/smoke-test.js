import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const API_KEY = __ENV.API_KEY || '';

const errorRate = new Rate('error_rate');
const successRate = new Rate('success_rate');

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    error_rate: ['rate<0.01'],
    success_rate: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
  },
};

function makeRequest(method, endpoint, body = null, headers = {}) {
  const url = `${BASE_URL}/api${endpoint}`;
  let res;

  // Add API key if provided (required for all endpoints except /health)
  const authHeaders = API_KEY ? { 'X-API-Key': API_KEY } : {};
  const allHeaders = { ...authHeaders, ...headers };

  if (method === 'POST') {
    const defaultHeaders = { 'Content-Type': 'application/json' };
    res = http.post(url, JSON.stringify(body), { headers: { ...defaultHeaders, ...allHeaders } });
  } else {
    res = http.get(url, { headers: allHeaders });
  }

  const isSuccess = check(res, {
    [`${method} ${endpoint} status is 200`]: (r) => r.status === 200,
  });

  errorRate.add(!isSuccess);
  successRate.add(isSuccess);

  return res;
}

export default function () {
  // Health check — no API key required
  makeRequest('GET', '/health');
  sleep(0.1);

  // The following endpoints require a valid X-API-Key header.
  // Set API_KEY env var to test authenticated endpoints:
  //   API_KEY=your-test-key k6 run tests/k6/smoke-test.js
  if (API_KEY) {
    makeRequest('POST', '/v1/auth/login', {
      username: 'smoke_test_user',
      password: 'smoke_test_pass',
    });
    sleep(0.1);

    makeRequest('GET', '/v1/calculate');
    sleep(0.1);

    makeRequest('GET', '/v1/portfolio');
    sleep(0.1);

    makeRequest('GET', '/v1/market/fx/rates');
    sleep(0.1);

    makeRequest('GET', '/v1/hedge-effectiveness/datasets');
    sleep(0.1);
  }
}
