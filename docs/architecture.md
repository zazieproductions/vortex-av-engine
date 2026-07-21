# System Architecture

VORTEX uses one continuous browser animation loop to coordinate three layers: audio analysis, WebGL rendering, and two-dimensional diagnostic displays.

## 1. Input and playback

A user-selected audio file is read as an `ArrayBuffer` and decoded by an `AudioContext`. The decoded buffer is connected to an `AnalyserNode`, which is then connected to the browser audio destination.

The file is processed locally and is never uploaded.

## 2. Analysis

On each animation frame, the analyzer produces frequency-domain and time-domain byte arrays. The frequency spectrum is divided into three approximate regions:

- bass
- midrange
- high frequencies

These averages become control values for separate parts of the visual system.

## 3. WebGL scene

The Three.js scene contains:

- a detailed wireframe icosahedron
- a smaller emissive inner core
- a 4,000-point particle field
- ambient and colored point lights
- exponential fog
- a perspective camera

The outer mesh is recalculated from stored original vertex positions. Trigonometric displacement provides a lightweight noise-like deformation whose depth is multiplied by midrange energy and the user-controlled distortion parameter.

## 4. Audio-to-visual mapping

Bass controls the inner core scale. Midrange energy changes the outer geometry. Strong high-frequency activity causes particle positions to expand; otherwise, particles interpolate back toward their original coordinates.

This separation creates a multi-channel visual response instead of applying one global amplitude value to every object.

## 5. Diagnostic canvases

Two Canvas 2D contexts visualize:

- the frequency spectrum as vertical bars
- the time-domain waveform as a line trace

They are resized alongside the main renderer.

## 6. Interface state

A shared state object tracks the audio context, source, decoded buffer, analyzer, playback state, duration, and timeline offsets. Parameter controls modify a separate parameter object used by the rendering loop.

## Next architectural step

The most important future improvement would be to formalize the signal-routing system. A routing layer could map arbitrary analyzer bands, MIDI controls, oscillators, envelopes, or external sensors to named visual parameters. That would turn the current interface prototype into a genuine modular audiovisual instrument.
