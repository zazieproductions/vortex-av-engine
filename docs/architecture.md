# System Architecture

> Technical reference for the VORTEX audiovisual engine.
> Applies to `assets/js/app.js` (single-module runtime), `index.html`, `assets/css/styles.css`.

---

## 1. Design goals

VORTEX is a zero-build, zero-dependency-install browser instrument. Every architectural decision
follows from four constraints:

| Constraint | Consequence |
| --- | --- |
| **No server, no upload** | Audio is decoded from a local `ArrayBuffer`; no network I/O after page load. |
| **Single render loop** | Audio analysis, WebGL, and Canvas 2D share one `requestAnimationFrame` tick to guarantee frame-coherent state. |
| **Deterministic teardown** | Every source type (file / mic / synth) is torn down through a single `stopAllSources()` funnel to avoid orphaned nodes and acoustic feedback. |
| **Static hosting** | Deployable to GitHub Pages as raw files (see `.github/workflows/static.yml`). |

## 2. Runtime topology

```
                        ┌───────────────────────────────────────────┐
   File / Mic / Synth ──▶│              AnalyserNode                 │──▶ destination*
                        │   fftSize 2048 · smoothing 0.85           │
                        └──────────────┬────────────────────────────┘
                                       │ getByteFrequencyData()
                                       │ getByteTimeDomainData()
                                       ▼
                        ┌───────────────────────────────────────────┐
                        │        Band reduction (bass/mid/high)     │
                        └──────────────┬────────────────────────────┘
                                       ▼
        ┌──────────────────────────────┴──────────────────────────────┐
        ▼                              ▼                              ▼
  WebGL scene graph            Canvas 2D analyzers             DOM telemetry
  (Three.js r128)              (spectrum + waveform)           (timeline, log, stats)
```

`*` The analyser→destination edge is **conditional**. It is connected for file and synth playback and
explicitly *disconnected* for microphone input — this is the acoustic feedback interlock
(§6).

## 3. Module map

`app.js` is organised as six ordered sections. Load order matters: DOM queries execute at parse time,
so the script is included at the end of `<body>`.

| § | Section | Responsibility | Key symbols |
| --- | --- | --- | --- |
| 1 | State & constants | Two plain objects: `params` (user-tunable) and `state` (runtime/session) | `params`, `state`, `log()` |
| 2 | UI initialisation | Builds the 32-cell modulation matrix, binds slider listeners | `matrixEl`, `param-*` handlers |
| 3 | Audio system | Context lifecycle, file decode, transport, teardown | `initAudioContext()`, `loadAudioFile()`, `playAudio()`, `stopAllSources()` |
| 4 | Live input | `getUserMedia` capture + feedback interlock | `startMic()` |
| 5 | Synthesis engine | Lookahead step sequencer and four voices | `startSynth()`, `scheduleStep()`, `playKick/Bass/Hihat/Lead()` |
| 6 | Visualisation | Three.js scene construction, resize, animation loop, 2D draws | `animate()`, `drawFreqVisualizer()`, `drawWaveVisualizer()` |

### State object contract

```js
state = {
  isPlaying:    boolean,                              // transport gate for UI updates
  sourceType:   'file' | 'mic' | 'synth' | null,      // discriminant for all branching
  audioContext: AudioContext | null,                  // created lazily on first gesture
  analyser:     AnalyserNode | null,                  // single shared analysis tap
  source:       AudioBufferSourceNode | null,         // file playback only (one-shot node)
  buffer:       AudioBuffer | null,                   // decoded PCM, retained for re-seek
  startTime:    number,                               // ctx clock reference for elapsed calc
  pauseTime:    number,                               // resume offset in seconds
  duration:     number,
  micStream:    MediaStream | null,
  micSource:    MediaStreamAudioSourceNode | null,
  synthTimer:   number | null,                        // setInterval id for the scheduler
  currentStep:  number                                // 0..63 sequencer position
}
```

`sourceType` is the single source of truth for mode. Any code that branches on input mode reads this
discriminant rather than inspecting node presence, which keeps the three transports mutually
exclusive by construction.

## 4. Lifecycle: lazy audio context

Browsers block `AudioContext` construction outside a user gesture (autoplay policy). VORTEX therefore
constructs the context lazily inside `initAudioContext()`, which is idempotent and called from every
entry point (`loadAudioFile`, `startMic`, `startSynth`, `playAudio`). A suspended context is resumed
explicitly before live input or synthesis starts.

```
page load ─▶ no AudioContext ─▶ [user gesture] ─▶ initAudioContext() ─▶ resume() if suspended
```

The animation loop starts immediately at parse time and is analyser-agnostic: when
`state.analyser` is null it renders the scene with all band energies at zero, so the visual system is
alive before any audio exists.

## 5. Frame pipeline

Each `animate()` tick executes in a fixed order. Cost figures assume default settings
(1024 bins, 15 360 mesh vertices, 4000 particles).

| Stage | Work | Order of magnitude |
| --- | --- | --- |
| 1. Acquire | 2 × `Uint8Array(1024)` allocation + analyser copy | O(N) — see [performance.md](performance.md) on the allocation hot spot |
| 2. Reduce | Single pass band summation over 1024 bins | O(N) |
| 3. Transport | Elapsed-time computation from the audio clock, timeline DOM write | O(1) |
| 4. Mesh morph | Per-vertex normalise + trig displacement over 15 360 vertices | O(V) |
| 5. Particles | Positional integration over 4000 points | O(P) |
| 6. Colour | HSL cycling of emissive + point light | O(1) |
| 7. Render | One `renderer.render()` draw pass | GPU-bound |
| 8. Analyzers | Two Canvas 2D redraws | O(N) fill ops |

Timing is derived from two independent clocks, deliberately:

- **`audioContext.currentTime`** — sample-accurate, used for scheduling and elapsed playback.
- **`Date.now()`** — wall clock, used for purely aesthetic phase (noise time, hue cycling).

Never mix them: audio-visual sync uses the audio clock; decorative motion uses the wall clock so it
keeps moving when the transport is stopped.

## 6. Acoustic feedback interlock

Microphone input routed to `destination` creates a positive-gain loop through the room
(mic → speakers → mic). VORTEX prevents this structurally rather than by attenuation:

```js
state.analyser.disconnect();                 // sever analyser → destination
state.micSource.connect(state.analyser);     // capture is analysis-only
```

The analyser remains a valid FFT tap while its output edge is severed, so the mic stream drives the
visuals but is never monitored. `stopAllSources()` restores a clean slate, and `playAudio()` /
`startSynth()` re-establish the destination edge when audible output is required.

## 7. Teardown funnel

`stopAllSources()` is the only path that releases resources, and it is exhaustive by design:

1. Stop + disconnect the `AudioBufferSourceNode` (one-shot nodes cannot be restarted).
2. Reset transport flags, timeline UI, and the play button label/classes.
3. Stop every `MediaStreamTrack` (releases the OS-level mic indicator) and disconnect the mic source.
4. `clearInterval` the sequencer timer.
5. Disconnect the analyser's outgoing edge to prevent feedthrough between modes.
6. Reset `sourceType` to `null`.

All `stop()`/`disconnect()` calls are wrapped in try/catch because the Web Audio spec throws on
nodes that were never started, and teardown must be safe to call from any state — including
re-entrantly from `startMic()`/`startSynth()`, which both call it before acquiring their own
resources.

## 8. Rendering subsystem

See [render-pipeline.md](render-pipeline.md) for the full scene graph, vertex morph derivation, and
particle integration model. In summary the scene holds:

- a wireframe `IcosahedronGeometry(10, 4)` shell (5120 faces / 15 360 non-indexed vertices) under
  `MeshStandardMaterial`, morphed on the CPU from a retained pristine copy of the position buffer;
- a solid `IcosahedronGeometry(4, 2)` inner core under `MeshBasicMaterial`, uniformly scaled by bass;
- a 4000-point `BufferGeometry` field under additive-blended `PointsMaterial`;
- ambient light plus two coloured point lights and `FogExp2(0x000000, 0.02)` for depth falloff.

## 9. Extension seam

The current mapping is hard-coded inside `animate()`. The highest-value architectural change is to
interpose a routing layer between analysis and rendering:

```
analysis ─▶ [ named sources ] ─▶ routing matrix ─▶ [ named sinks ] ─▶ renderer
             bass, mid, high        gain/curve      coreScale, meshDisplacement,
             rms, centroid,         per edge        particleDispersion, hueRate
             MIDI CC, LFO, env
```

That turns the 32-cell modulation matrix (today an interface study that perturbs `params.speed`)
into a real sparse routing graph, and makes MIDI, OSC, and sensor inputs additive rather than
invasive. Tracked as [ADR-0004](adr/0004-modulation-routing-layer.md).

## Related documents

- [signal-flow.md](signal-flow.md) — Web Audio graph and band-reduction mathematics
- [render-pipeline.md](render-pipeline.md) — WebGL scene graph and deformation model
- [synthesis-engine.md](synthesis-engine.md) — lookahead scheduler and voice design
- [api-reference.md](api-reference.md) — internal function reference
- [performance.md](performance.md) — frame budget, profiling, and known hot paths
