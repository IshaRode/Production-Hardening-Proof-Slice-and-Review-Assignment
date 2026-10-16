const { test } = require('node:test');
const assert = require('node:assert');
const { createCircuitBreaker } = require('../src/circuitBreaker');

function fail() {
  return Promise.reject(new Error('provider down'));
}

function ok() {
  return Promise.resolve('drafted');
}

test('rolling sample window prevents past successes from diluting recent failure bursts', async () => {
  const cb = createCircuitBreaker({
    failureThreshold: 0.5,
    minimumRequests: 5,
    windowSize: 10,
  });

  // 1. Simulate 100 successful requests during normal operation
  for (let i = 0; i < 100; i++) {
    await cb.exec(ok);
  }
  assert.equal(cb.state, 'CLOSED');
  assert.equal(cb.metrics.success_total, 100);

  // 2. Provider suffers an outage: a burst of 5 consecutive failures
  // In a naive implementation, 5 failures / 105 calls = 4.76% (below 50% threshold),
  // which would incorrectly keep the breaker closed and let doomed calls pile up.
  // In the rolling window of size 10, the 5 failures evict older successes:
  // 5 failures / 10 window calls = 50% >= failureThreshold, tripping the breaker!
  for (let i = 0; i < 5; i++) {
    await cb.exec(fail).catch(() => {});
  }

  assert.equal(cb.state, 'OPEN');
  assert.equal(cb.metrics.breaker_open_total, 1);
});

test('configurable windowSize bounds the evaluation sample size', async () => {
  const cb = createCircuitBreaker({
    failureThreshold: 0.5,
    minimumRequests: 3,
    windowSize: 4,
  });

  // 10 prior successes
  for (let i = 0; i < 10; i++) {
    await cb.exec(ok);
  }

  // 2 failures in a window of 4 is 50% (2/4) and meets minimumRequests (4 >= 3)
  await cb.exec(fail).catch(() => {});
  assert.equal(cb.state, 'CLOSED');
  await cb.exec(fail).catch(() => {});
  assert.equal(cb.state, 'OPEN');
  assert.equal(cb.metrics.breaker_open_total, 1);
});
