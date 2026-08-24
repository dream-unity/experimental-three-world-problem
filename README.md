# Experimental Three-World Problem

A live, autonomous WebGL experiment about three mutually coupled worlds of mind:

1. **Dream Machine** — mechanism, memory, prediction and simulation.
2. **Dream Maker** — self, value, imagination, selection and intention.
3. **The World That Makes Dreams Real** — action, resistance, tools, other minds and consequence.

The point is not that the three worlds collapse into one substance. Their **causal loop** becomes one system:

> perceive → simulate → value → intend → act → transform → perceive again

## Autonomous field

The current version is **not a video and no longer runs on a one-minute scripted timeline**. It is a continuous dynamical system. Coupling, coherence, recursion and convergence evolve indefinitely from overlapping oscillatory fields, so the three worlds continuously approach, separate, exchange information and reorganise around a recursive attractor without a hard loop reset.

## Performance architecture

The simulation is designed to remain visually rich without depending on expensive full-screen post-processing:

- direct WebGL rendering rather than EffectComposer/UnrealBloom
- additive sprite glows instead of full-screen bloom
- instanced geometry for neural nodes, thought fragments and physical structures
- GPU-driven recursive vortex shader
- reduced CPU geometry updates
- link geometry updated at half-rate
- HUD/DOM updates throttled independently from rendering
- adaptive device-pixel-ratio and particle counts
- automatic quality downgrade when sustained FPS drops
- lower-cost defaults on coarse-pointer/mobile-class hardware
- capped simulation delta after stalls so motion slows gracefully instead of jumping forward
- no animated CSS blur fields or noise filters
- simulation time stops advancing while the page is hidden

## Controls

- **Free Orbit** — unlock drag/orbit/pinch-zoom navigation.
- **Auto Camera** — return to the autonomous camera.
- **Sound** — enable the procedural Web Audio field.
- **Quality** — cycle Auto → Low → Medium → High → Auto.
- **Recenter** — leave focused/orbit views and return to the whole system.
- **World labels** — enter or leave a close view of a particular world.
- **Double-click/tap the field** — recenter.

## Run

This is a zero-build static Three.js project. Serve it over HTTP so browser ES modules work correctly.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

The project can also be hosted directly with GitHub Pages.

## Stack

- Three.js
- OrbitControls
- GLSL ShaderMaterial
- InstancedMesh
- Web Audio API
- No framework, build step, texture pack, video asset, or 3D asset dependency
