# Internal API Reference

`assets/js/app.js` executes as a single classic script in the global scope — there is no module
system, no bundler, and no export surface. Everything below is therefore reachable from the browser
console on a running page, which makes the console a first-class debugging and performance interface.

> **Stability.** These are internal implementation details, not a public API. They are documented so
> the runtime can be inspected, tuned, and extended, not because they are stable across versions.

---

## Global objects

### `params`

User-facing parameters. Mutating any field takes effect on the next frame or, for synth parameters,
on the next scheduled step (within ~100 ms).

| Field | Type | Range | Default | Bound control | Consumed by |
| --- | --- | --- | --- | --- | --- |
| `speed` | number | 0.1 – 3.0 | 1.0 | `#param-speed` | rotation rate, noise time, particle drift, hue rate |
| `distortion` | number | 0 – 2.0 | 0.5 | `#param-distort` | mesh displacement depth, core scale |
| `colorShift` | number | — | 0 | none | *reserved — currently unused* |
| `rotationSpeed` | number | — | 0.005 | none | *reserved — rotation derives from `speed`* |
| `leadPitchMult` | number | 0.5 – 2.0 | 1.0 | `#param-lead-pitch` | `playLead()` frequency multiplier |
| `bassFilterFreq` | number | 100 – 1200 | 400 | `#param-bass-filter` | `playBass()` lowpass base cutoff (Hz) |

`colorShift` and `rotationSpeed` are declared but not read; they are placeholders for the routing
work described in [ADR-0004](adr/0004-modulation-routing-layer.md).

### `state`

Session and transport state. See [architecture.md §3](architecture.md#state-object-contract) for the
full contract. `state.sourceType` is the discriminant that governs all mode branching.

---

## Logging

### `log(msg) → void`

Appends `> ${msg}` to `#console-log` and evicts the oldest line beyond five, keeping the diegetic
terminal at fixed height without a scroll container.

---

## Audio system

### `initAudioContext() → void`

Idempotent. Creates the `AudioContext` and the shared `AnalyserNode`
(`fftSize = 2048`, `smoothingTimeConstant = 0.85`) on first call; subsequent calls are no-ops.
Must be reached from a user gesture to satisfy browser autoplay policy. Called defensively by every
entry point.

### `loadAudioFile(file) → void`

| Param | Type | Description |
| --- | --- | --- |
| `file` | `File` | From the file input or a drag-and-drop `DataTransfer` |

Reads the file as an `ArrayBuffer` via `FileReader`, decodes it with the callback form of
`decodeAudioData`, tears down any active source, populates `state.buffer` / `state.duration`, updates
the track-info panel, and auto-starts playback. Decode failures are reported to the in-page log.

The file never leaves the page.

### `playAudio() → void`

Creates a fresh `AudioBufferSourceNode` — required, since these nodes are one-shot and cannot be
restarted — connects `source → analyser → destination`, and starts at
`offset = pauseTime % duration`. Sets `startTime = currentTime − offset` so elapsed time is always
derivable as `currentTime − startTime`, then flips transport state and button styling.

Registers an `onended` handler that funnels natural completion into `stopAllSources()`, guarded on
`sourceType === 'file'` so that a mode switch does not trigger a spurious stop.

No-op when `state.buffer` is null.

### `pauseAudio() → void`

Stops the current source and records `pauseTime = currentTime − startTime` for later resume.
Because `AudioBufferSourceNode` cannot be resumed, "pause" is really *stop and remember the offset*;
`playAudio()` then re-creates the node at that offset.

Only acts when `sourceType === 'file'`.

### `stopAllSources() → void`

The single teardown funnel. Exhaustively releases every resource across all three modes:
buffer source, microphone tracks and stream source, sequencer interval, analyser output edge,
transport flags, and all associated UI state. Safe to call from any state and re-entrantly — every
`stop()`/`disconnect()` is guarded, because Web Audio throws on nodes that were never started.

Called by: the stop button, natural track end, mode switches, `startMic()`, `startSynth()`, and
`loadAudioFile()`.

---

## Live input

### `startMic() → void`

Initialises and resumes the context, tears down existing sources, **disconnects the analyser from the
destination** (the acoustic feedback interlock — see
[signal-flow.md §1](signal-flow.md#microphone--line-input)), then requests
`getUserMedia({ audio: true, video: false })`.

On success, wires `MediaStreamAudioSourceNode → analyser` and switches the UI to live mode. On
rejection — denial, no device, insecure origin — it logs the failure and calls `stopAllSources()` to
return to a clean state.

> Requires a secure context: `https://` or `http://localhost`. Opening `index.html` via `file://`
> will fail the permission request in most browsers.

---

## Synthesis

### `getNoiseBuffer() → AudioBuffer`

Lazily generates and memoises a 100 ms mono buffer of uniform white noise
(`Math.random() * 2 − 1`) at the context sample rate. Shared by every hi-hat hit.

### `startSynth() → void`

Starts the lookahead sequencer: 25 ms `setInterval` driving a 100 ms scheduling horizon at 120 BPM /
125 ms per 16th step, wrapping at 64 steps. Reconnects the analyser to the destination so the output
is audible. See [synthesis-engine.md §2](synthesis-engine.md#2-lookahead-scheduling).

### `scheduleStep(step, time) → void`

| Param | Type | Description |
| --- | --- | --- |
| `step` | number | Absolute step index, 0–63 |
| `time` | number | `AudioContext` clock time at which the step should sound |

Resolves `bar` and `stepInBar`, selects the chord for the bar, and dispatches the kick, bass, hi-hat,
and lead voices according to the rhythm grid. Pure dispatch — holds no state of its own.

### Voice constructors

All are fire-and-forget: they construct their node chain, schedule its envelopes against `time`,
start, and schedule their own `stop()`. All terminate at `state.analyser`.

| Function | Signature | Chain | Node lifetime |
| --- | --- | --- | --- |
| `playKick` | `(time)` | sine osc → gain | 0.18 s |
| `playBass` | `(freq, time)` | saw osc → lowpass → gain | 0.15 s |
| `playHihat` | `(time, volume)` | noise buffer → highpass 7 kHz → gain | 0.05 s |
| `playLead` | `(freq, time)` | triangle osc → bandpass Q=3 → gain | 0.22 s |

Envelope details in [synthesis-engine.md §4](synthesis-engine.md#4-voice-designs).

---

## Utilities

### `formatTime(seconds) → string`

Formats to zero-padded `MM:SS`. Overflows past 60 minutes rather than adding an hours field.

### `updateTimelineUI(progress) → void`

| Param | Type | Description |
| --- | --- | --- |
| `progress` | number | Normalised position, 0.0 – 1.0 |

Sets the playback bar width and playhead offset. The current-time readout is mode-dependent:
elapsed `MM:SS` for files, `STEP_nn` for the synth, unchanged for live input (which has no position).

---

## Visualisation

### `animate() → void`

The single `requestAnimationFrame` loop, started at parse time and never cancelled. Per frame it
acquires FFT and time-domain data, reduces to three band energies, updates the transport UI, applies
all audio-reactive transforms, renders the WebGL scene, and redraws both 2D analyzers.

Analyser-agnostic: with no audio context, all band energies are zero and the scene still animates
via the wall clock.

### `drawFreqVisualizer(data) → void`

Renders `data` as vertical bars with per-bin gradient colouring, widening bars by 2.5× and breaking
once the canvas is filled (~40% of bins drawn). No-op on an empty array.

### `drawWaveVisualizer(data) → void`

Strokes the time-domain array as a single cyan path, mapping `data[i] / 128.0` to vertical position
so 128 (silence) sits at the vertical centre.

### `resize() → void`

Updates renderer size, camera aspect and projection matrix, and resets both 2D canvas backing stores
to their parents' client dimensions. Bound to `window.resize` and called once at startup.

---

## Console recipes

Because everything is global, the running instrument can be driven from DevTools:

```js
// Push the deformation past its intended range
params.distortion = 2;

// Freeze all decorative motion, isolating audio-driven response
params.speed = 0.1;

// Inspect live band energies
const d = new Uint8Array(state.analyser.frequencyBinCount);
state.analyser.getByteFrequencyData(d);
console.table({
  bass: d.slice(0, 10).reduce((a, b) => a + b) / 10,
  mid:  d.slice(10, 102).reduce((a, b) => a + b) / 92,
  high: d.slice(102).reduce((a, b) => a + b) / 922
});

// Trade smoothing for transient response
state.analyser.smoothingTimeConstant = 0.6;

// Transpose the arpeggio by a non-tempered ratio
params.leadPitchMult = 1.5;
```
