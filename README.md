# Starter — Circuit Breaker Proof Slice (PromptPilot)

This is the starter repository for **Option B (provided scenario)** of the assignment.

Repository: `https://github.com/kalviumcommunity/Production-Hardening-Proof-Slice-and-Review-Assignment` (public, owned by
`kalviumcommunity`). Fork it, implement the breaker, and open a pull request back to your fork.

> The control here is a **circuit breaker**, covered earlier in this module. You are applying a
> concept you have already learned, not a new one.

## Scenario

PromptPilot drafts support replies by calling an external model provider. When the provider is slow
or failing, every request still tries it, so doomed calls pile up and the failure spreads. You will
add a **circuit breaker** so sustained failures short-circuit fast to a safe fallback, then recover
through a probe.

## Your task

Implement the circuit breaker in [`src/circuitBreaker.js`](./src/circuitBreaker.js). The file has a
skeleton and a `TODO`. The behaviour is fully specified by the supplied tests.

Prerequisite: Node.js 18 or newer (the tests use Node's built-in test runner). Then run:

```bash
node --test
```

Make **all tests pass**. Do **not** modify the tests. The reply path in `src/replyService.js` is
already wired to your breaker.

The breaker must:

- start `CLOSED` and count calls and failures;
- move to `OPEN` when `failures / calls >= failureThreshold` **and** `calls >= minimumRequests`;
- while `OPEN` and within `openMillis`, short-circuit (throw `CircuitOpenError` without calling the
  dependency) and increment `metrics.short_circuited_total`;
- after `openMillis` elapses (using the injected `now()`), allow one `HALF_OPEN` probe — success
  closes it and resets counts, failure re-opens it;
- increment `metrics.breaker_open_total` on every trip and call `onStateChange(state)` on every
  transition.

## Production Hardening Summary

### 1. Risk addressed
Prevents cascading failure and resource exhaustion caused by doomed requests piling up when the external model provider is slow or failing.

### 2. Chosen control
A three-state circuit breaker (`CLOSED`, `OPEN`, `HALF_OPEN`) with threshold tripping, probe recovery, and a rolling sample window (`windowSize`, defaulting to `Math.max(minimumRequests * 2, 10)`), implemented in [`src/circuitBreaker.js`](./src/circuitBreaker.js) to ensure recent failure bursts trip the breaker regardless of older successes.

### 3. How to run / test
Run `node --test` (or `npm test`); expected result is all 10 automated unit tests passing with zero failures:
```text
✔ stays closed below the minimum request volume (0.51ms)
✔ opens once failures cross the threshold with enough volume (0.15ms)
✔ short-circuits without calling the dependency while open (0.23ms)
✔ probes after the open window and closes on a successful probe (0.41ms)
✔ a failed probe re-opens the circuit (0.10ms)
✔ reports state changes for observability (0.28ms)
✔ returns a model draft while the provider is healthy (0.48ms)
✔ degrades to a safe fallback once the circuit opens (0.16ms)
✔ rolling sample window prevents past successes from diluting recent failure bursts (1.05ms)
✔ configurable windowSize bounds the evaluation sample size (0.13ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

### 4. Evidence
[`test/rollingWindow.test.js`](./test/rollingWindow.test.js) proves that 100 historical successes cannot dilute a burst of failures from tripping the breaker, [`test/circuitBreaker.test.js`](./test/circuitBreaker.test.js) proves immediate short-circuiting while open, and [`test/replyService.test.js`](./test/replyService.test.js) proves safe fallback response handling.

### 5. Observability note
Increments `metrics.breaker_open_total` when tripping, increments `metrics.short_circuited_total` on blocked calls, and invokes `onStateChange(state)` (`OPEN`, `HALF_OPEN`, `CLOSED`) without exposing payloads or secrets.

### 6. Trade-off
A smaller rolling window trips quickly on bursts but is more sensitive to transient blips, and requests during the `openMillis` cooldown receive fallback drafts even if the provider recovers early.

### 7. Remaining risk
Maintains state locally in-process (not distributed across multiple worker replicas) and still relies on an upstream call timeout for hung connections.

### 8. How this production control protects my Modules 1–3 design
Protects PromptPilot's core availability contract by isolating external AI dependency failures and ensuring support reply generation degrades gracefully to human triage.


