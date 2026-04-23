import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const API_KEY = __ENV.API_KEY || '';

const errorRate = new Rate('error_rate');
const successRate = new Rate('success_rate');

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '3m', target: 100 },
    { duration: '3m', target: 150 },
    { duration: '2m', target: 200 },
    { duration: '2m', target: 200 },
    { duration: '2m', target: 100 },
    { duration: '2m', target: 50 },
    { duration: '2m', target: 0 },
  ],
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

function authLogin() {
  return makeRequest('POST', '/v1/auth/login', {
    username: 'stress_test_user',
    password: 'stress_test_pass',
  });
}

function getHealth() {
  return makeRequest('GET', '/health');
}

function getCalculations() {
  return makeRequest('GET', '/v1/calculate');
}

function getPortfolio() {
  return makeRequest('GET', '/v1/portfolio');
}

function getFxRates() {
  return makeRequest('GET', '/v1/market/fx/rates');
}

function getHedgeDatasets() {
  return makeRequest('GET', '/v1/hedge-effectiveness/datasets');
}

export default function () {
  getHealth();
  sleep(0.1);

  if (API_KEY) {
    authLogin();
    sleep(0.1);

    getCalculations();
    sleep(0.1);

    getPortfolio();
    sleep(0.1);

    getFxRates();
    sleep(0.1);

    getHedgeDatasets();
    sleep(0.1);
  }
}
