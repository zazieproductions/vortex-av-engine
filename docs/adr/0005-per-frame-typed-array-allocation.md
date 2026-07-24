# ADR-0005 — Per-frame typed array allocation

- **Status:** Accepted (with known fix)
- **Scope:** `assets/js/app.js` — `animate()` analysis block
- **Related:** [performance.md §3](../performance.md#3-allocation-pressure)

## Context

The render loop allocates two fresh `Uint8Array`s every frame to receive analyser data:

```js
const bufferLength = state.analyser.frequencyBinCount;   // 1024
dataArray = new Uint8Array(bufferLength);
state.analyser.getByteFrequencyData(dataArray);
waveArray = new Uint8Array(bufferLength);
state.analyser.getByteTimeDomainData(waveArray);
```

At 60 fps this is 120 allocations per second totalling ~123 KB/s, or ~7.4 MB per minute of
short-lived garbage. It is the only allocation in the loop — the mesh morph and particle
integration were both explicitly written to be allocation-free (see
[ADR-0001](0001-cpu-vertex-morph.md)), which makes this the sole remaining GC contributor.

## Decision

Ship as-is, document the cost precisely, and record the fix.

Two reasons. First, the arrays are textbook nursery objects: uniformly sized, uniformly short-lived,
never promoted. Generational collectors bump-allocate and sweep them essentially for free, and in
practice the observable effect is a low-amplitude minor-GC sawtooth rather than dropped frames.
Second, the sizing is correct by construction — reading `frequencyBinCount` fresh each frame means
the code cannot desynchronise from the analyser if `fftSize` is changed at runtime from the console,
which is a real debugging workflow for this project.

Fixing it correctly therefore requires not just hoisting the arrays but adding a length guard, which
is more code than the naïve version and only pays off under measurement. Given that the frame budget
is dominated by the 15 360-vertex morph loop at 3–6 ms, ~0.02 ms of allocation is not where
optimisation effort belongs first.

The honest framing: this is a known, quantified, low-severity inefficiency with a two-line fix, not a
defensible design choice. It is recorded here so that it is a decision rather than an oversight.

## The fix

```js
// module scope
let dataArray = null;
let waveArray = null;

// inside animate(), once the analyser exists
const binCount = state.analyser.frequencyBinCount;
if (!dataArray || dataArray.length !== binCount) {
    dataArray = new Uint8Array(binCount);
    waveArray = new Uint8Array(binCount);
}
state.analyser.getByteFrequencyData(dataArray);
state.analyser.getByteTimeDomainData(waveArray);
```

The length guard preserves the runtime-`fftSize` property that motivated the current code, so the
fix is strictly better rather than a trade.

One subtlety it introduces: the arrays now retain the previous frame's contents when no analyser
exists, where the current code hands the 2D drawing functions a zero-length array. `animate()`
already guards on `state.analyser` and `drawFreqVisualizer()` early-returns on an empty array, so the
fix must also clear or skip on teardown to avoid drawing a frozen spectrum after `stopAllSources()`.

## Consequences

**Accepted:**

- ~123 KB/s of nursery garbage and a periodic minor-GC sawtooth.
- On memory-constrained mobile devices with less headroom, this contributes to occasional frame
  variance.

**Gained:**

- The analysis block stays four self-contained lines with no module-scope mutable state and no
  cache-invalidation logic.
- Buffer sizing cannot desynchronise from analyser configuration.

## Alternatives considered

**Hoist without a length guard.** Two lines, no branch — but silently breaks if `fftSize` changes at
runtime, producing a truncated or over-long read. Rejected: the guard costs one comparison per frame.

**Allocate once inside `initAudioContext()`.** Cleanest lifetime story, since that is where the
analyser and its `fftSize` are established. Requires the loop to handle the pre-context null case,
which it already does. A good option, and the natural pairing if the fix is applied.

**Use `SharedArrayBuffer` or an `AudioWorklet` analysis path.** Eliminates copies entirely and moves
analysis off the main thread. Disproportionate here, and cross-origin isolation requirements would
complicate the static-hosting model ([ADR-0003](0003-cdn-dependencies.md)).

## Revisiting

Apply the fix as part of any performance pass that also addresses the morph loop, or immediately if
mobile becomes a supported target. It should not be applied in isolation and presented as a
meaningful optimisation — the morph loop is two orders of magnitude more expensive.
