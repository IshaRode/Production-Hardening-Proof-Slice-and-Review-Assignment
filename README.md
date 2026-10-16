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
A three-state circuit breaker (`CLOSED`, `OPEN`, `HALF_OPEN`) with threshold tripping and probe recovery, implemented in [`src/circuitBreaker.js`](./src/circuitBreaker.js).

### 3. How to run / test
Run `node --test` (or `npm test`); expected result is all 8 automated unit tests passing with zero failures.

### 4. Evidence
`test/circuitBreaker.test.js` proves requests short-circuit immediately without invoking the dependency when open, and `test/replyService.test.js` proves users safely receive `FALLBACK_TEXT`.

### 5. Observability note
Increments `metrics.breaker_open_total` when tripping, increments `metrics.short_circuited_total` on blocked calls, and invokes `onStateChange(state)` (`OPEN`, `HALF_OPEN`, `CLOSED`) without exposing payloads or secrets.

### 6. Trade-off
Temporarily routes traffic to fallback support queues during the `openMillis` window even if the provider recovers before the cooldown expires.

### 7. Remaining risk
Maintains state locally in-process (not distributed across multiple worker replicas) and still relies on an upstream call timeout for hung connections.

### 8. How this production control protects my Modules 1–3 design
Protects PromptPilot's core availability contract by isolating external AI dependency failures and ensuring support reply generation degrades gracefully to human triage.

