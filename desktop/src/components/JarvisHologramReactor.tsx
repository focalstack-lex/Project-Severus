import React, { useEffect, useRef } from "react";
import * as THREE from "three";

export type ReactorState = "idle" | "listening" | "solving" | "speaking";

export interface JarvisHologramReactorProps {
  state?: ReactorState;
  size?: number;
  audioAmplitude?: number; // 0 to 1
  onClick?: () => void;
  className?: string;
}

export const JarvisHologramReactor: React.FC<JarvisHologramReactorProps> = ({
  state = "idle",
  size = 280,
  audioAmplitude = 0,
  onClick,
  className = "",
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const ampRef = useRef(audioAmplitude);

  stateRef.current = state;
  ampRef.current = audioAmplitude;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = size;
    const height = size;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 240;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Color Palette
    const cyanColor = new THREE.Color("#06b6d4");
    const tealColor = new THREE.Color("#22d3ee");
    const purpleColor = new THREE.Color("#c084fc");
    const greenColor = new THREE.Color("#4ade80");

    // 1. Central Geodesic Neural Lattice Core
    const coreGeometry = new THREE.IcosahedronGeometry(28, 2);
    const coreWireframeMaterial = new THREE.MeshBasicMaterial({
      color: cyanColor,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreWireframeMaterial);
    scene.add(coreMesh);

    // Core Vertex Points (Glowing Nodes)
    const corePointsMaterial = new THREE.PointsMaterial({
      color: tealColor,
      size: 3.2,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const corePoints = new THREE.Points(coreGeometry, corePointsMaterial);
    scene.add(corePoints);

    // Inner Glowing Core Sphere
    const innerGeometry = new THREE.SphereGeometry(14, 16, 16);
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: cyanColor,
      transparent: true,
      opacity: 0.35,
    });
    const innerSphere = new THREE.Mesh(innerGeometry, innerMaterial);
    scene.add(innerSphere);

    // 2. Concentric Undulating Wave Ribbons (Particle Rings)
    const ringConfigs = [
      { radius: 48, count: 240, speed: 1.4, freq: 6, ampScale: 5.5, size: 2.2, color: tealColor },
      { radius: 68, count: 320, speed: -1.1, freq: 8, ampScale: 8.0, size: 2.0, color: cyanColor },
      { radius: 88, count: 420, speed: 0.9, freq: 10, ampScale: 11.0, size: 1.8, color: tealColor },
      { radius: 108, count: 520, speed: -0.7, freq: 12, ampScale: 14.0, size: 1.6, color: cyanColor },
    ];

    const rings: Array<{
      points: THREE.Points;
      basePositions: Float32Array;
      config: (typeof ringConfigs)[number];
    }> = [];

    ringConfigs.forEach((config) => {
      const positions = new Float32Array(config.count * 3);
      const basePositions = new Float32Array(config.count * 3);

      for (let i = 0; i < config.count; i++) {
        const theta = (i / config.count) * Math.PI * 2;
        const x = Math.cos(theta) * config.radius;
        const y = Math.sin(theta) * config.radius;
        const z = (Math.random() - 0.5) * 3;

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        basePositions[i * 3] = x;
        basePositions[i * 3 + 1] = y;
        basePositions[i * 3 + 2] = z;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const material = new THREE.PointsMaterial({
        color: config.color,
        size: config.size,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });

      const points = new THREE.Points(geometry, material);
      scene.add(points);
      rings.push({ points, basePositions, config });
    });

    // Outer Ambient Dust Particles
    const dustCount = 180;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const radius = 30 + Math.random() * 95;
      const theta = Math.random() * Math.PI * 2;
      dustPositions[i * 3] = Math.cos(theta) * radius;
      dustPositions[i * 3 + 1] = Math.sin(theta) * radius;
      dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 45;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    const dustMaterial = new THREE.PointsMaterial({
      color: cyanColor,
      size: 1.4,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
    });
    const dustMesh = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dustMesh);

    // Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      const elapsedTime = clock.getElapsedTime();
      const currentState = stateRef.current;
      const audioAmp = ampRef.current;

      // Color Adaptation by State
      let targetColor = cyanColor;
      let stateSpeedMul = 1.0;

      if (currentState === "listening") {
        targetColor = greenColor;
        stateSpeedMul = 1.6;
      } else if (currentState === "solving") {
        targetColor = purpleColor;
        stateSpeedMul = 2.4;
      } else if (currentState === "speaking") {
        targetColor = tealColor;
        stateSpeedMul = 1.8;
      }

      coreWireframeMaterial.color.lerp(targetColor, 0.08);
      corePointsMaterial.color.lerp(targetColor, 0.08);
      innerMaterial.color.lerp(targetColor, 0.08);

      // Core Rotation & Pulse
      const coreSpeed = 0.4 * stateSpeedMul;
      coreMesh.rotation.x = elapsedTime * coreSpeed * 0.7;
      coreMesh.rotation.y = elapsedTime * coreSpeed;
      corePoints.rotation.x = coreMesh.rotation.x;
      corePoints.rotation.y = coreMesh.rotation.y;

      // Audio-driven Core Scale
      const baseScale = 1.0 + Math.sin(elapsedTime * 2.5) * 0.04;
      const dynamicScale = baseScale + audioAmp * 0.28;
      coreMesh.scale.set(dynamicScale, dynamicScale, dynamicScale);
      corePoints.scale.set(dynamicScale, dynamicScale, dynamicScale);

      // Update Concentric Harmonic Particle Wave Rings
      rings.forEach(({ points, config }, ringIdx) => {
        const positions = points.geometry.attributes.position.array as Float32Array;
        const time = elapsedTime * config.speed * stateSpeedMul;
        const currentAmp = (config.ampScale * (0.35 + audioAmp * 1.8));

        for (let i = 0; i < config.count; i++) {
          const theta = (i / config.count) * Math.PI * 2;
          const wave1 = Math.sin(theta * config.freq + time) * currentAmp;
          const wave2 = Math.cos(theta * (config.freq * 0.5) - time * 1.3) * (currentAmp * 0.5);
          const totalWave = wave1 + wave2;

          const r = config.radius + totalWave;
          positions[i * 3] = Math.cos(theta) * r;
          positions[i * 3 + 1] = Math.sin(theta) * r;
          positions[i * 3 + 2] = Math.sin(theta * 3 + time * 2) * (currentAmp * 0.4) + (ringIdx % 2 === 0 ? 3 : -3);
        }

        points.geometry.attributes.position.needsUpdate = true;
        points.rotation.z = elapsedTime * 0.06 * (ringIdx % 2 === 0 ? 1 : -1);
      });

      // Dust Rotation
      dustMesh.rotation.z = elapsedTime * 0.03;

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup on unmount
    return () => {
      cancelAnimationFrame(animId);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      coreGeometry.dispose();
      coreWireframeMaterial.dispose();
      corePointsMaterial.dispose();
      innerGeometry.dispose();
      innerMaterial.dispose();
      dustGeometry.dispose();
      dustMaterial.dispose();
      rings.forEach(({ points }) => {
        points.geometry.dispose();
        (points.material as THREE.Material).dispose();
      });
      renderer.dispose();
    };
  }, [size]);

  return (
    <div
      ref={mountRef}
      className={`jarvis-hologram-canvas-wrap ${className}`}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
      }}
    />
  );
};

export default JarvisHologramReactor;
