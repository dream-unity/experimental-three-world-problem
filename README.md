# Experimental Three-World Problem

A cinematic, interactive WebGL experiment about three mutually-coupled worlds of mind:

1. **Dream Machine** — mechanism, memory, prediction and simulation.
2. **Dream Maker** — self, value, imagination, selection and intention.
3. **The World That Makes Dreams Real** — action, resistance, tools, other minds and consequence.

The point of the simulation is not that the three worlds collapse into one substance. Their **causal loop** becomes one system:

> perceive → simulate → value → intend → act → transform → perceive again

## Experience

The one-minute simulation moves through six phases:

- Separation
- Resonance
- Entanglement
- Convergence
- World-Making
- Recursion

It includes procedural geometry, thousands of particles, animated information transfer, a central strange-attractor field, bloom post-processing, cinematic camera choreography, selectable worlds, free-orbit navigation, timeline scrubbing, and optional generative ambient audio.

## Run

This is a zero-build static Three.js project. Serve it over HTTP so browser ES modules work correctly.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

The project can also be hosted directly with GitHub Pages.

## Controls

- **Pause / Play** — stop or resume simulated time.
- **Free Orbit** — unlock drag/orbit/zoom controls.
- **Sound** — enable a procedural Web Audio drone that evolves with the field.
- **Reset** — return to phase one.
- **Timeline** — scrub anywhere through the full causal sequence.
- **World labels** — enter or leave a focused view of one world.

## Stack

- Three.js
- OrbitControls
- EffectComposer
- UnrealBloomPass
- Web Audio API
- No framework, build step, texture pack, or 3D asset dependency
