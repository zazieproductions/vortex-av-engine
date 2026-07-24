# ADR-0001 — CPU vertex morphing instead of a vertex shader

- **Status:** Accepted
- **Scope:** `assets/js/app.js` — `animate()` morph loop
- **Related:** [render-pipeline.md §3](../render-pipeline.md#3-vertex-morph-model), [performance.md §2](../performance.md#2-the-dominant-hot-path)

## Context

The outer icosahedral shell is deformed by mid-band audio energy every frame. The deformation is
per-vertex, independent across vertices, and depends only on the rest position, a time scalar, and
two control scalars — precisely the shape of a workload that belongs on the GPU.

Two implementations were available:

1. Mutate `BufferGeometry.attributes.position` in JavaScript each frame and re-upload it.
2. Write a custom `ShaderMaterial` whose vertex shader computes displacement from uniforms.

At detail level 4 the shell has 15 360 non-indexed vertices, so option 1 costs roughly 46 000
transcendental evaluations and 15 000 square roots per frame, plus a full position-buffer upload.

## Decision

Morph on the CPU, reading from a pristine copy of the rest-pose position array.

The decisive factors were **legibility and modifiability**. The project's purpose is as much
demonstrative as functional: the audio-to-geometry mapping should be readable by anyone who opens
one file. In JavaScript the mapping is eight lines of ordinary arithmetic sitting directly next to
the band-reduction code that produces its inputs. Moved into GLSL it becomes a template string, a
uniform-plumbing layer, and a manual lighting reimplementation — because `MeshStandardMaterial`'s
physically-based shading is not available to a custom `ShaderMaterial` without either extending the
material system via `onBeforeCompile` or rewriting the lighting model.

The measured cost was also acceptable: 3–6 ms of a 16.67 ms budget on mid-range hardware, in an
application with no other significant CPU work and no post-processing.

Two decisions make the CPU path defensible rather than merely tolerable:

- **Morph from a retained rest pose, never incrementally.** Accumulating displacement onto the live
  buffer would compound floating-point error over thousands of frames and eventually distort the
  geometry permanently. Re-deriving from `originalPositions` makes the shape a pure function of
  `(time, mid, distortion)` — exactly reversible, and identical whether the audio has been running
  for one second or one hour.
- **Allocate nothing in the loop.** A single hoisted `THREE.Vector3` scratch object is reused across
  all 15 360 iterations, so the hottest loop in the program contributes zero GC pressure.

## Consequences

**Accepted:**

- The morph is the application's dominant CPU cost and the limiting factor on low-end and high-DPI
  devices.
- A full position-buffer upload occurs every frame (~184 KB).
- Vertex normals are not recomputed, so the shell is effectively locked to wireframe rendering.
  A solid material would need `computeVertexNormals()` and roughly double the cost.
- Detail level, not shading complexity, is the tuning knob for weak hardware.

**Gained:**

- The core creative logic is inspectable and editable in the browser console on a live page — a
  visitor can type `params.distortion = 2` and immediately see the geometry break.
- Full `MeshStandardMaterial` PBR shading with no reimplementation.
- No shader compilation, no uniform plumbing, no GLSL/JS duplication of the noise function.

## Alternatives considered

**Custom `ShaderMaterial`.** Fastest option by a wide margin and the correct end state for a
performance-first build. Rejected for this iteration on legibility grounds, and because it would
require reimplementing the lighting model.

**`onBeforeCompile` injection into `MeshStandardMaterial`.** Keeps PBR shading while adding GPU
displacement. Rejected as fragile — it depends on the internal chunk names of a specific Three.js
version, which is a poor foundation for a pinned-CDN project.

**Lower detail level.** Detail 3 would cut the cost 4× immediately. Rejected because the wireframe's
density is central to the visual identity; this remains the recommended first move for constrained
hardware rather than a default.

## Revisiting

Move to a vertex shader if any of the following becomes true: detail level rises above 4, a second
morphed mesh is added, post-processing is introduced, or mobile becomes a first-class target. The
migration is self-contained — the displacement function ports to GLSL almost line for line, with
`midFreq`, `time`, and `distortion` becoming uniforms.
