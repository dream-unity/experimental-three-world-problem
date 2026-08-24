# Dream Unity — Experimental Three-World Problem

A visual-first autonomous WebGL simulation of three mutually coupled worlds:

1. **Dream Machine** — perception, modelling, prediction.
2. **Dream Maker** — intention, action, becoming.
3. **Dream World** — matter, structure, emergence.

The main scene is the interface. There is no video player, timeline, dashboard, or scripted loop.

## Interaction

- Tap/click any of the three worlds to enter it.
- Each world opens into its own three-node 3D micro-simulation.
- Tap the internal nodes to inject an impulse into that world's dynamics.
- Drag inside a world to orbit it.
- Scroll on desktop to move closer/farther away.
- Use **← UNITY** to return to the three-world field.

## Three nested simulations

### Dream Machine
A rotating neural lattice connecting **Perceive → Model → Predict**.

### Dream Maker
A fluid field of shards and nonlinear geometry connecting **Intend → Act → Become**.

### Dream World
An evolving spatial lattice connecting **Matter → Structure → Emerge**.

## Performance

The experience uses direct Three.js rendering without full-screen post-processing. Repeated geometry is instanced, connection geometry updates at reduced frequency, expensive detail fields are hidden outside their selected world, frame delta is capped after stalls, and device pixel ratio adapts downward automatically if sustained FPS drops.

## Stack

- Three.js
- WebGL
- InstancedMesh
- Pointer/raycast interaction
- Zero build step
- No video assets
- No external 3D assets

Serve over HTTP or host directly with GitHub Pages.
