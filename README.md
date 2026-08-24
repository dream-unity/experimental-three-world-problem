# Dream Unity — Experimental Three-World Problem

A visual-first autonomous simulation of three mutually coupled worlds:

1. **Dream Machine** — perception, modelling, prediction.
2. **Dream Maker** — intention, action, becoming.
3. **Dream World** — matter, structure, emergence.

The main scene is the interface. There is no video player, timeline, dashboard, or scripted loop.

## True 3D triad interaction

The overview is a mathematically projected three-dimensional object, not a transformed webpage layer.

- Hold and drag with a mouse to orbit the complete **Dream Machine / Dream Maker / Dream World** triad around Unity.
- Drag with one finger on a touchscreen to orbit the same 3D object.
- Pinch with two fingers to move closer to or farther from the triad.
- Twist two fingers to roll the 3D triad.
- Two-finger movement adjusts its viewing angle.
- Mouse wheel zooms the 3D camera.
- Depth changes object scale, connection strength, label position and paint order; nearer worlds occlude farther worlds.
- Double-tap or double-click empty space to restore the canonical orientation.

No CSS or DOM transform is used for this interaction. Each world and connection is rotated in model space and projected back onto the canvas every frame.

## Nested worlds and games

Tap/click any world to enter its internal triad:

- **Dream Machine:** Perceive, Model, Predict
- **Dream Maker:** Intend, Act, Become
- **Dream World:** Matter, Structure, Emerge

Each internal label opens a distinct playable game, producing nine games in total. Internal triads retain their own drag-orbit, pinch-zoom and wheel-zoom controls.

## Performance

- Self-contained Canvas 2D projection engine
- No external rendering library or video asset
- Capped frame delta after stalls
- Adaptive device-pixel ratio on sustained low frame rate
- Reduced object counts on mobile-class hardware
- Throttled DOM label updates
- Main visualization pauses while a game is active
- Same-origin, versioned engine chunks with retry and loader fail-safe

## Stack

- Canvas 2D
- Pointer Events
- Perspective projection and 3D rotation mathematics
- Web Audio API for games
- Zero build step

Serve over HTTP or host directly with GitHub Pages.
