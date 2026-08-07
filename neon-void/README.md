# Zeal Survivors v2: The Void

Free-flight 3D space shooter — Unity 6, synthwave everything. All geometry,
materials, UI, and audio are generated procedurally in code; there are no
imported assets.

## Opening the project

1. Open **Unity Hub**, sign in, and make sure a **Personal license** is active
   (Hub does this automatically on first sign-in).
2. **Add project from disk** → select this `neon-void` folder.
3. Open it with **Unity 6000.5.x**. First import takes a few minutes.
4. On first open an editor script auto-builds `Assets/Scenes/NeonVoid.unity`
   (menu: **Neon Void → Build Game Scene** to rebuild it manually).
5. Press **Play**.

## Controls

| Input | Action |
|---|---|
| Mouse | Steer (ship chases the cursor) |
| W / S | Throttle up / down |
| Shift | Boost |
| Q / E | Roll |
| Click / Space | Fire |
| M | Mute |

## Design

Waves of drones spawn on a shell around you in a big asteroid belt. Drones
orbit-strafe and fire lead-corrected bursts. Asteroids are shootable and
collidable. Score has a combo multiplier; shields regenerate, hull doesn't.
Backdrop: procedural starfield, nebula sprites, ringed planet, neon sun —
skybox-object rig pinned to the camera. Post stack: bloom, vignette,
chromatic aberration, grain (PPv2, built-in render pipeline).
