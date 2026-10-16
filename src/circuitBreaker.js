'use strict';

// Your task: implement a circuit breaker around PromptPilot's model provider.
//
// The supplied tests in test/circuitBreaker.test.js describe the exact behaviour.
// Do not modify the tests. Make them all pass.
//
// Requirements proven by the tests:
//   - Start in the CLOSED state. While CLOSED, count calls and failures.
//   - OPEN when (failures / calls) >= failureThreshold AND calls >= minimumRequests.
//   - While OPEN and within openMillis, SHORT-CIRCUIT: throw CircuitOpenError
//     WITHOUT calling fn, and increment metrics.short_circuited_total.
//   - After openMillis has elapsed (use the injected now()), allow ONE probe
//     call (HALF_OPEN). A successful probe -> CLOSED and reset the counts.
//     A failed probe -> OPEN again.
//   - Increment metrics.breaker_open_total every time you move to OPEN.
//   - Call options.onStateChange(state) on every state transition.
//
// Injected options (all optional, with sensible defaults):
//   failureThreshold, minimumRequests, openMillis, now, onStateChange

class CircuitOpenError extends Error {
  constructor() {
    super('circuit is open');
    this.code = 'CIRCUIT_OPEN';
  }
}

function createCircuitBreaker(options = {}) {
  const failureThreshold = options.failureThreshold ?? 0.5;
  const minimumRequests = options.minimumRequests ?? 5;
  const windowSize = options.windowSize ?? Math.max(minimumRequests * 2, 10);
  const openMillis = options.openMillis ?? 10000;
  const now = options.now ?? Date.now;
  const onStateChange = options.onStateChange ?? function () {};

  const metrics = {
    breaker_open_total: 0,
    short_circuited_total: 0,
    success_total: 0,
    failure_total: 0,
  };

  let state = 'CLOSED';
  let window = [];
  let openedAt = 0;
  let probeInFlight = false;

  function transitionTo(newState) {
    state = newState;
    if (newState === 'OPEN') {
      openedAt = now();
      metrics.breaker_open_total++;
      window = [];
    } else if (newState === 'CLOSED') {
      window = [];
    }
    onStateChange(state);
  }

  async function exec(fn) {
    if (state === 'OPEN') {
      if (now() - openedAt >= openMillis) {
        transitionTo('HALF_OPEN');
      } else {
        metrics.short_circuited_total++;
        throw new CircuitOpenError();
      }
    }

    if (state === 'HALF_OPEN') {
      if (probeInFlight) {
        metrics.short_circuited_total++;
        throw new CircuitOpenError();
      }
      probeInFlight = true;
      try {
        const result = await fn();
        metrics.success_total++;
        transitionTo('CLOSED');
        return result;
      } catch (err) {
        metrics.failure_total++;
        transitionTo('OPEN');
        throw err;
      } finally {
        probeInFlight = false;
      }
    }

    // CLOSED state with rolling sample window
    try {
      const result = await fn();
      metrics.success_total++;
      window.push(0);
      if (window.length > windowSize) {
        window.shift();
      }
      return result;
    } catch (err) {
      metrics.failure_total++;
      window.push(1);
      if (window.length > windowSize) {
        window.shift();
      }
      const windowCalls = window.length;
      const windowFailures = window.reduce((sum, val) => sum + val, 0);
      if (windowCalls >= minimumRequests && windowFailures / windowCalls >= failureThreshold) {
        transitionTo('OPEN');
      }
      throw err;
    }
  }

  return {
    exec,
    metrics,
    get state() {
      return state;
    },
  };
}

module.exports = { createCircuitBreaker, CircuitOpenError };
