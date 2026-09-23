# JARVIS Holographic Particle Waveform Reactor & Centered Interactive HUD Specification

## 1. Objective & Scope
Transform Severus's conversational Thinking Mode from the top Apple-style Dynamic Island notch into a centered 3D Holographic JARVIS Particle Waveform Reactor HUD. The new interface provides concentric harmonic particle wave ribbons, a 3D wireframe geodesic core, real-time speech reactivity, draggable centering, interactive action halos, and seamless system tray integration upon exit.

---

## 2. Visual Architecture & 3D Wave Dynamics

### 2.1 Concentric Harmonic Wave Ribbons
- **Color Palette**: Glowing cyan, teal, and electric azure (`#06b6d4`, `#22d3ee`, `#0891b2`, `#00f2fe`, `rgba(6, 182, 212, 0.85)`).
- **Particle Dynamics**: 3-4 concentric orbital bands composed of thousands of glowing particles undulating via composite trigonometric wave functions:
  $$r(\theta, t) = R_0 + A_1 \sin(k_1 \theta + \omega_1 t) + A_2 \cos(k_2 \theta - \omega_2 t) + \Delta_{\text{audio}}$$
- **Audio Reactivity**: Driven in real time by Web Audio API analyser frequencies during user speech and `subscribeSpeechFrame` harmonic amplitude pulses during Severus spoken responses.

### 2.2 Central Geodesic Neural Lattice Core
- **Geometry**: 3D icosahedron / geodesic sphere rendered with cyan wireframe edges, glowing vertex nodes, and specular core bloom.
- **Motion**: Dual-axis gyroscopic rotation (pitch + yaw) with acceleration during thinking/processing states.

### 2.3 State Transitions
- **Idle / Ambient**: Slow, breathing orbital rotation with subtle cyan particle shimmer.
- **Listening (User Speaking)**: Greenish-cyan frequency ripples undulating with live microphone energy levels.
- **Solving / Thinking**: Dynamic orbital spin with shifting deep indigo/cyan energy waves and pulsating neural nodes.
- **Speaking (JARVIS Responding)**: High-amplitude harmonic wave ribbons oscillating in direct synchronization with synthesized speech.

---

## 3. HUD Layout & User Interaction

### 3.1 Centered Draggable Floating Cockpit
- **Default Position**: Centered on the viewport with smooth spring physics (`framer-motion`).
- **Drag Capability**: Framer Motion `drag` constraints allowing repositioning anywhere on screen while remembering coordinates during the session.

### 3.2 Interactive Orbital Action Controls
Surrounding the holographic core are interactive minimalist glassmorphic controls:
- **Mic Toggle**: Quick mute/unmute of continuous recognition.
- **Audio Wave Status**: Live speech recognition transcript bubble.
- **Journal Quick-Save**: Commit thinking session summary directly to `journal/YYYY-MM-DD.md`.
- **Workstation Expander**: Transition into the full Second Brain knowledge graph cockpit.
- **Exit to Tray**: Minimizes Severus to the system tray (`hide_to_tray`).

### 3.3 Executive Response Card
When queries return structured data (Strava runs, academic deadlines, knowledge notes), an executive HUD card expands smoothly below the holographic reactor with high-contrast typography and metric chips.

---

## 4. Component Structure & Data Flow

1. **`JarvisHologramReactor.tsx`**:
   - Canvas/WebGL rendering engine handling geodesic lattice math, particle wave equations, and audio reactivity.
   - Reusable standalone component with `state`, `size`, `audioAmplitude`, and `interactive` props.
2. **`ThinkingModeReactor.tsx` (replaces `ThinkingModeCapsule.tsx`)**:
   - Main container hosting the centered floating HUD, speech recognition hooks, AI query streaming, and transcript management.
3. **`App.tsx` Integration**:
   - Replaces `ThinkingModeCapsule` references with `ThinkingModeReactor`.
   - Cleans up legacy Dynamic Island references in favor of the centered JARVIS HUD.
4. **Tauri System Tray Behavior**:
   - Exit button calls Tauri window hide (`hide_to_tray`) to keep Severus active in the system tray.

---

## 5. Verification & Testing Strategy

1. **Visual & 60fps Performance**:
   - Verify smooth 60fps canvas rendering across all 4 state transitions (ambient, listening, solving, speaking).
2. **Acoustic Reactivity**:
   - Verify particle wave deflection when microphone input is detected.
   - Verify wave synchronization during neural TTS playback.
3. **Interactive HUD Controls**:
   - Test dragging, mic toggling, journal commit, and workstation expansion.
4. **System Tray Persistence**:
   - Test closing the HUD and confirming Severus remains in the Windows notification area tray.
5. **Production Build Compilation**:
   - Run `npm run build` and `severus build` to generate updated MSI and NSIS installers.
