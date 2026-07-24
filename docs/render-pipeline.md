# Render Pipeline

WebGL scene graph, deformation mathematics, and per-frame update model.
Target: Three.js **r128** (global `THREE`, loaded from CDN).

---

## 1. Scene graph

```
Scene  (fog: FogExp2 #000000, density 0.02)
├── PerspectiveCamera   fov 75° · near 0.1 · far 1000 · z = +30
├── Mesh "coreSphere"   IcosahedronGeometry(10, 4)   MeshStandardMaterial (wireframe)
├── Mesh "innerCore"    IcosahedronGeometry(4, 2)    MeshBasicMaterial (solid, α 0.8)
├── Points "particles"  BufferGeometry · 4000 pts    PointsMaterial (additive)
├── AmbientLight        #404040
├── PointLight          #00f0ff · intensity 2 · distance 100 · at (10, 10, 10)
└── PointLight          #ff003c · intensity 2 · distance 100 · at (−10, −10, 10)
```

Renderer: `WebGLRenderer({ antialias: true, alpha: true })` with
`setPixelRatio(window.devicePixelRatio)` and no post-processing chain — a single forward pass.

## 2. Geometry budget

`IcosahedronGeometry(radius, detail)` in r128 returns **non-indexed** geometry: each triangle owns
three unshared vertices.

| Object | Detail | Faces | Position entries | Notes |
| --- | --- | --- | --- | --- |
| Outer shell | 4 | 20 · 4⁴ = **5120** | 15 360 vertices | morphed per-vertex every frame |
| Inner core | 2 | 20 · 4² = 320 | 960 vertices | never morphed, only scaled |
| Particle field | — | — | 4000 points | 12 000 floats position + 12 000 floats pristine copy |

Face count for detail *d* is `20 · 4^d`; vertex count is `3 ×` that for non-indexed geometry. Detail 4
therefore produces a dense shell whose per-vertex CPU morph dominates the frame budget — this is the
single most expensive loop in the application and the primary knob for low-end devices
(see [performance.md](performance.md)).

## 3. Vertex morph model

The outer shell is deformed on the CPU each frame. A pristine copy of the position buffer is taken
once at startup and is never mutated:

```js
const originalPositions = positionAttribute.array.slice();  // immutable reference pose
```

Morphing from a retained rest pose (rather than accumulating onto the live buffer) is essential:
incremental displacement would drift and eventually blow up, because floating-point error compounds
across thousands of frames. Every frame re-derives the shape from scratch, so the geometry is a pure
function of `(time, midFreq, distortion)` and is exactly reversible when the audio stops.

### Per-vertex derivation

For each vertex **v₀** of the rest pose, with `t = Date.now() · 0.001 · speed`:

```
n(v₀, t) = sin(0.5·v₀ₓ + t) · cos(0.5·v₀ᵧ + t) · sin(0.5·v₀_z + t)     ∈ [−1, 1]

d        = n(v₀, t) · (mid / 50) · distortion

v        = normalize(v₀) · (10 + d)
```

**Properties of the separable trig field.** The product of three phase-shifted sinusoids is a cheap
stand-in for gradient noise. It is C∞ continuous, exactly periodic in `t` with period 2π, and costs
three transcendental calls per vertex instead of a full simplex evaluation. Its weakness is
axis-alignment: because the field is separable in x, y, z, the deformation shows a faint cubic
symmetry rather than isotropic lumps. At detail 4 with wireframe shading this reads as structure
rather than as an artefact, which is why it was kept — see
[ADR-0001](adr/0001-cpu-vertex-morph.md).

The frequency coefficient `0.5` sets the spatial wavelength to `2π / 0.5 ≈ 12.6` units against a
radius of 10, so roughly one full lobe wraps each hemisphere: large, legible deformations rather
than high-frequency noise that would alias in the wireframe.

**Renormalisation** (`v₀.normalize()`) discards the rest position's magnitude and rebuilds it as
`10 + d`. This makes displacement purely radial: the surface breathes outward and inward along the
sphere normal, never shearing tangentially. Peak displacement at `mid = 255`, `distortion = 2` is
`±10.2` units — the shell can pass through its own centre, an intentional extreme.

After the loop, `positionAttribute.needsUpdate = true` flags one buffer re-upload to the GPU per
frame.

> **Note.** Vertex normals are not recomputed after the morph. The shell renders as a wireframe, so
> the stale normals are invisible; switching it to a solid material would require
> `geometry.computeVertexNormals()` and would roughly double the CPU cost of the morph.

## 4. Inner core

The inner core is a uniform scale only — no vertex work:

```js
const scale = 1 + (bassFreq / 255) * (params.distortion * 2);
innerCore.scale.set(scale, scale, scale);
```

At `distortion = 0.5` the core swells to at most 2× on a full-scale kick; at `distortion = 2` up to
5×, at which point it visibly punches through the shell on every beat. `MeshBasicMaterial` makes it
unlit and self-luminous, so it stays a hard silhouette against the shaded wireframe regardless of
light position.

## 5. Particle field

4000 points are seeded uniformly in a 100³ cube (`(random − 0.5) · 100`) and a pristine copy is
retained, mirroring the mesh strategy. Each frame every point runs two behaviours:

**Idle drift** — a positional sine wave phase-offset by the point's own x coordinate, so the field
shimmers incoherently rather than pulsing as a block:

```
pᵧ += sin(t + pₓ) · 0.02 · speed
```

**Dispersion gate** — a hard threshold on high-band energy:

```
if high > 100:   p ← p · 1.005            // radial expansion from the origin, 0.5%/frame
else:            p ← p + (p₀ − p) · 0.02  // exponential ease home, α = 0.02
```

The two halves are asymmetric on purpose. Expansion is *multiplicative*, so it compounds — one
second of sustained high energy at 60 fps scales the field by `1.005^60 ≈ 1.35`, and points already
far from the origin travel fastest, producing an accelerating outward rush. Recovery is a
*linear-interpolation ease* with α = 0.02, whose settling time to 5% error is
`ln(0.05) / ln(0.98) ≈ 148` frames (~2.5 s). Fast attack, slow release: the field snaps out on a
cymbal and drifts back over the following bar.

Because expansion is unbounded while the gate is held, sustained bright material can push points
past the far plane at z = 1000; they re-enter as the ease pulls them home. Clamping the maximum
radius is a known refinement.

## 6. Colour system

One hue value cycles both the shell's emissive colour and the cyan point light, held 180° apart on
the colour wheel:

```js
const hue = (Date.now() * 0.0001 * params.speed) % 1;
material.emissive.setHSL(hue, 1, 0.5);
pointLight.color.setHSL((hue + 0.5) % 1, 1, 0.5);
```

At `speed = 1` the coefficient `0.0001` per millisecond yields one full hue rotation every
10 seconds, scaling inversely with the speed parameter. The complementary offset guarantees the emissive glow and the key light never converge
to the same hue, preserving colour separation between the mesh's own emission and its lit
highlights. The red point light and the yellow particle material stay fixed as chromatic anchors.

## 7. Fog and depth

`FogExp2(0x000000, 0.02)` attenuates by `f = e^{−(density · depth)²}`. With the camera at z = +30 and
the particle cloud spanning ±50, points at the far edge sit around 80 units away and are attenuated
to `e^{−(1.6)²} ≈ 0.08` — effectively black. This is what gives the field apparent depth without a
depth-of-field pass, and it also hides particles that the dispersion gate has flung outward, so
unbounded expansion degrades gracefully into darkness rather than into visible popping.

## 8. Canvas 2D analyzers

Two independent `CanvasRenderingContext2D` surfaces are redrawn after the WebGL pass.

**Spectrum** — vertical bars, `barWidth = (w / bins) · 2.5`, with an early `break` once `x > w`. The
2.5× widening means only about 40% of the 1024 bins are ever drawn, which is both a deliberate
optimisation and an implicit low-pass on the display: the visible range tops out near
`0.4 · 24 kHz ≈ 9.6 kHz`, where most musical content lives. Bar colour is interpolated across the
sweep so frequency reads as hue.

**Oscilloscope** — a single `stroke()` path over all bins, `sliceWidth = w / bins`, no decimation.
At 1024 points across a few hundred CSS pixels this oversamples horizontally; the resulting dense
trace is the intended CRT look.

Both canvases have their backing-store dimensions reset to their parent's client size inside
`resize()`, which also updates the renderer size and the camera's aspect + projection matrix.

## 9. Resize handling

```js
renderer.setSize(w, h);
camera.aspect = w / h;
camera.updateProjectionMatrix();   // mandatory after any aspect change
freqCanvas.width = freqCanvas.parentElement.clientWidth;   // resets backing store
…
```

`resize()` is bound to `window.resize` and invoked once at startup so first paint is correct.
Assigning to `canvas.width`/`height` (as opposed to CSS size) resets the backing store and clears
the surface — required to avoid blurry upscaled 2D output on HiDPI displays.

## 10. Tuning reference

| Symbol | Location | Default | Effect of increasing |
| --- | --- | --- | --- |
| `IcosahedronGeometry(10, 4)` detail | scene setup | 4 | ×4 vertices per level; smoother morph, quadratic CPU cost |
| `particleCount` | scene setup | 4000 | Denser field, linear CPU cost |
| `0.5` (noise frequency) | morph loop | 0.5 | Smaller, busier lobes |
| `/50` (mid normaliser) | morph loop | 50 | Lower value → more violent displacement |
| `1.005` (dispersion rate) | particle loop | 1.005 | Faster outward rush |
| `0.02` (recovery α) | particle loop | 0.02 | Snappier return home |
| `100` (dispersion threshold) | particle loop | 100 | Higher → dispersion triggers less often |
| `0.02` (fog density) | scene setup | 0.02 | Tighter, darker depth falloff |
