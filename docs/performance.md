# Performance Engineering

Frame budget, measured hot paths, known allocation pressure, and a tuning ladder for constrained
hardware.

---

## 1. Frame budget

The target is 60 fps — a **16.67 ms** wall-clock budget per frame, shared between audio analysis,
CPU geometry work, GPU submission, and two Canvas 2D redraws, all on the main thread.

Approximate distribution on a mid-range 2020 laptop (integrated GPU, 1440×900 viewport, default
settings):

| Stage | Budget | Notes |
| --- | --- | --- |
| Analyser reads + band reduction | ~0.3 ms | Two 1024-byte copies plus one linear pass |
| **Mesh morph (15 360 vertices)** | **~3 – 6 ms** | Dominant CPU cost |
| Particle integration (4000 points) | ~0.4 ms | Simple, cache-friendly |
| Buffer uploads (position attributes) | ~0.5 ms | Two `needsUpdate` re-uploads per frame |
| `renderer.render()` submission | ~1 – 2 ms | Single forward pass, no post-processing |
| Canvas 2D analyzers | ~0.8 ms | ~400 `fillRect` + one long path |
| **Total** | **~7 – 11 ms** | Leaves headroom on desktop; tight on mobile |

GPU-side cost is modest — one wireframe draw, one small solid mesh, one point cloud, no shadows, no
post-processing. **This application is CPU-bound, not fill-rate bound.** Optimisation effort belongs
in the morph loop, not in the shading.

## 2. The dominant hot path

```js
for (let i = 0; i < positionAttribute.count; i++) {   // 15 360 iterations
    vertex.fromArray(originalPositions, i * 3);
    const noise = Math.sin(vertex.x * 0.5 + time)
                * Math.cos(vertex.y * 0.5 + time)
                * Math.sin(vertex.z * 0.5 + time);
    const dist = noise * (midFreq / 50) * params.distortion;
    vertex.normalize().multiplyScalar(10 + dist);
    positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
}
```

Per frame this executes **46 080 transcendental calls** (three per vertex) plus 15 360 square roots
from `normalize()`, at 60 fps — roughly **2.8 million `sin`/`cos` evaluations per second**.

Mitigations already in place:

- A single reused `THREE.Vector3` scratch object (`vertex`) hoisted outside the loop, so the morph
  allocates nothing.
- `originalPositions` is a flat `Float32Array` read linearly — sequential, cache-friendly access.
- One `needsUpdate` flag per frame rather than per-vertex GPU calls.

Remaining headroom, in descending order of impact:

1. **Move the morph to a vertex shader.** The computation is embarrassingly parallel and per-vertex
   with no cross-vertex dependencies — a textbook GPU workload. A custom `ShaderMaterial` with
   `uTime`, `uMid`, and `uDistortion` uniforms would eliminate both the CPU loop and the per-frame
   buffer upload, likely dropping frame cost by 3–6 ms. This is the single highest-value optimisation
   available and is tracked in [ADR-0001](adr/0001-cpu-vertex-morph.md).
2. **Cache `normalize()`.** Rest-pose directions are constant; precomputing 15 360 unit vectors once
   at startup removes a `sqrt` and three divisions per vertex per frame at the cost of ~184 KB.
3. **Precompute per-vertex phase.** `v₀ · 0.5` is invariant; only `+ t` changes. Storing scaled
   coordinates removes three multiplies per vertex.
4. **Lower the detail level.** `IcosahedronGeometry(10, 3)` cuts vertices 4× to 3840 with modest
   visual loss.

## 3. Allocation pressure

The one genuine garbage-collection issue in the runtime:

```js
dataArray = new Uint8Array(bufferLength);   // 1024 B, every frame
waveArray = new Uint8Array(bufferLength);   // 1024 B, every frame
```

Two typed arrays allocated per frame is **~123 KB/s** of short-lived garbage, or ~7.4 MB per minute.
Modern generational collectors handle this in the nursery cheaply, but it still produces periodic
minor-GC sawtooth that can cost a frame during heavy interaction.

**Fix** — hoist both to module scope and reuse:

```js
// module scope, allocated once after initAudioContext()
let dataArray = null, waveArray = null;

// inside animate(), after the analyser exists
if (!dataArray || dataArray.length !== state.analyser.frequencyBinCount) {
    dataArray = new Uint8Array(state.analyser.frequencyBinCount);
    waveArray = new Uint8Array(state.analyser.frequencyBinCount);
}
state.analyser.getByteFrequencyData(dataArray);
state.analyser.getByteTimeDomainData(waveArray);
```

The length guard handles the case where `fftSize` changes at runtime. Tracked in
[ADR-0005](adr/0005-per-frame-typed-array-allocation.md).

## 4. Pixel ratio and fill rate

```js
renderer.setPixelRatio(window.devicePixelRatio);
```

Unclamped. On a 3× display this renders **nine times** as many fragments as at 1×. The scene is
geometry-bound rather than fill-bound so the impact is usually tolerable, but on high-DPI laptops
with integrated graphics it is the difference between comfortable and marginal. The conventional
guard:

```js
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

`devicePixelRatio` is also read only at startup and inside `resize()`; dragging the window between
displays of different densities will not update it until a resize event fires.

## 5. DOM write discipline

Per-frame DOM writes are the classic hidden cost in visualisers. VORTEX keeps them bounded:

- `updateTimelineUI()` writes three properties, and only while `isPlaying`.
- The telemetry readout is gated behind `Math.random() > 0.95`, so it writes on ~5% of frames
  (~3/s) — deliberate rate limiting that keeps the readout legible *and* cheap.
- Slider labels update only on `input` events, never in the loop.
- The log evicts beyond five lines, bounding the node count.

No layout-reading properties (`offsetWidth`, `getBoundingClientRect`) are touched inside the loop, so
the render loop never triggers forced synchronous layout.

## 6. Background tab behaviour

`requestAnimationFrame` is throttled or suspended in background tabs, which stops the render loop —
correct and desirable. Note the consequences:

- **File playback** continues (audio runs on its own thread) and resyncs cleanly on return, since
  elapsed time derives from `audioContext.currentTime`, not from a frame counter.
- **The synthesiser** is driven by `setInterval`, which browsers clamp to ≥1000 ms in background
  tabs. The lookahead window is only 100 ms, so the sequence will gap and stutter. The robust fix is
  to move the scheduler into an `AudioWorklet` or a `Worker` timer, both of which are exempt from
  clamping.

## 7. Profiling recipes

**Instrument the morph loop** in the DevTools console on a running page:

```js
let t0 = performance.now(), frames = 0, acc = 0;
const origRender = renderer.render.bind(renderer);
renderer.render = (...a) => { acc += performance.now() - t0; origRender(...a); };
// then sample requestAnimationFrame deltas over a few seconds
```

**Cheaper A/B tests**, no code changes required:

```js
// Isolate GPU cost: eliminate the morph by zeroing its driver
params.distortion = 0;

// Isolate 2D canvas cost
drawFreqVisualizer = () => {};
drawWaveVisualizer = () => {};

// Test fill-rate sensitivity
renderer.setPixelRatio(1);
```

If frame time barely moves when `distortion = 0`, the bottleneck is GPU or fill rate; if it drops
sharply, the morph loop is the constraint — which is the expected result on most hardware.

## 8. Tuning ladder for low-end hardware

Apply in order; each step is independent.

| Step | Change | Vertex/frag saving | Visual cost |
| --- | --- | --- | --- |
| 1 | `setPixelRatio(Math.min(dpr, 2))` | Up to 55% of fragments | None on ≤2× displays |
| 2 | `particleCount` 4000 → 2000 | 2000 point updates | Sparser field |
| 3 | `IcosahedronGeometry(10, 3)` | 11 520 vertices (−75%) | Coarser wireframe |
| 4 | Hoist the typed arrays (§3) | ~123 KB/s of garbage | None |
| 5 | `antialias: false` | MSAA resolve | Aliased wireframe edges |
| 6 | `smoothingTimeConstant` 0.85 → 0.9 | None (perceptual) | Smoother, less twitchy motion |

## 9. Measured baselines

Informal figures for orientation, not benchmarks. Default settings, 1080p viewport.

| Class | Example | Frame time | Result |
| --- | --- | --- | --- |
| Desktop discrete GPU | Any modern dGPU | 4 – 6 ms | Locked 60 fps, large headroom |
| Laptop integrated | Intel Iris / Apple M-series | 7 – 11 ms | Locked 60 fps |
| High-DPI integrated | 3× display, unclamped ratio | 14 – 20 ms | Marginal; apply step 1 |
| Mobile | Recent flagship phone | 15 – 25 ms | 40–60 fps; apply steps 1–3 |

The dense workstation layout targets desktop viewports regardless of raw performance — the
interface, not the renderer, is the mobile constraint.
