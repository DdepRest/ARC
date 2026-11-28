import * as THREE from "three";
import type { ReactorMaterials } from "./reactor-materials";
import type { ReactorLighting } from "./reactor-lighting";
import type { ReactorParticles } from "./reactor-particles";
import type { ReactorPostFX } from "./reactor-postfx";
import type { ReactorGeometryResult } from "./reactor-geometry";
import { themeAccentHex } from "./reactor-theme";
import type { GraphicsConfig } from "../../../features/settings/logic/graphics-presets";
import {
  getActiveDiagnosticFlags,
  recordDiagnosticFrameSample,
} from "../../../features/settings/composables/useRenderBottleneckDiag";
import {
  resolveSignatureForState,
  createDefaultSignature,
  lerpSignature,
  type ReactorSignatureVector,
} from "./reactor-signatures";
import {
  computeReactorVisualTargets,
  computeLoadDrivenSpeed,
  computeRamGlowPulse,
  computeRunnerSpeedMultiplier,
  mapBassToCoreScale,
  mapMidToTurbineSpeed,
  mapTrebleToFilamentIntensity,
  exponentialSmooth,
  type AudioBands,
  type ReactorVisualTargets,
} from "../reactorMetrics";

export interface ReactorStateDriverParams {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  materials: ReactorMaterials;
  lighting: ReactorLighting;
  particles: ReactorParticles;
  postfx: ReactorPostFX;
  geometry: ReactorGeometryResult;
  getEffectiveConfig?: () => GraphicsConfig;
  getReactorState: () => string;
  getVoiceState?: () => string;
  getIntensity: () => number | undefined;
  getCoreCenter: () => { x: number; y: number } | undefined;
  getCoreScale: () => number | undefined;
  getSettingsStore: () => any;
  getSystemStore: () => any;
  getUIStore: () => any;
  getAudioTargets: () => {
    bassTarget: number;
    midTarget: number;
    trebleTarget: number;
    currentAudioTarget: number;
  };
}

export const REACTOR_OUTER_RADIUS = 5.62;

export function computeReactorViewportTransform(params: {
  winW: number;
  winH: number;
  camZ: number;
  fov: number;
  aspect: number;
  centerProp?: { x: number; y: number };
  scaleProp?: number;
}): { x: number; y: number; scale: number } {
  const { winW, winH, camZ, fov, aspect, centerProp, scaleProp } = params;
  const baseScale = scaleProp !== undefined ? scaleProp : 1.0;
  const safeW = Math.max(winW, 1);
  const safeH = Math.max(winH, 1);
  const safeAspect = aspect > 0 ? aspect : safeW / safeH;
  const halfFovRad = ((fov * 0.5) * Math.PI) / 180.0;
  const vHalfHeight = Math.max(20, camZ) * Math.tan(halfFovRad);
  const vHalfWidth = vHalfHeight * safeAspect;

  let targetX = 0;
  let targetY = 0;
  if (centerProp) {
    const normX = centerProp.x > 1.5 ? centerProp.x / safeW : centerProp.x;
    const normY = centerProp.y > 1.5 ? centerProp.y / safeH : centerProp.y;
    targetX = (normX - 0.5) * 2.0 * vHalfWidth;
    targetY = -(normY - 0.5) * 2.0 * vHalfHeight;
  }

  // Apply +10% scale boost when viewport allows; clamp strictly so reactor never clips or overlaps UI.
  // On narrow/portrait screens (phones, narrow panes), allow width-driven scaling below 0.90 so the
  // full outer silhouette fits horizontally with ~6% breathing margin on each side.
  const desiredScale = baseScale * 1.10;
  const isNarrowViewport = safeAspect < 1.05 || safeW < 768;
  const yBottomSafe = -vHalfHeight * 0.75; // Safe distance above bottom dock bar
  const yTopSafe = vHalfHeight * 0.84;     // Safe distance below top header bar
  const xSideSafe = vHalfWidth * (isNarrowViewport ? 0.87 : 0.74);
  const maxScaleBottom = Math.max(0.25, (targetY - yBottomSafe) / REACTOR_OUTER_RADIUS);
  const maxScaleTop = Math.max(0.25, (yTopSafe - targetY) / REACTOR_OUTER_RADIUS);
  const maxScaleSide = Math.max(0.25, (xSideSafe - Math.abs(targetX)) / REACTOR_OUTER_RADIUS);
  const maxAllowedScale = Math.min(maxScaleBottom, maxScaleTop, maxScaleSide);
  const safeScale = Math.max(0.25, Math.min(desiredScale, maxAllowedScale));

  return { x: targetX, y: targetY, scale: safeScale };
}

export const APERTURE_MECHANICAL_BOUNDS = {
  minScale: 0.96,
  maxScale: 1.14,
  baseOffset: 0.91,
  rawSlope: 0.17,
} as const;

export function mapApertureToMechanicalScale(rawAperture: number): number {
  const safeRaw = Number.isFinite(rawAperture) ? rawAperture : 0.4;
  const mapped =
    APERTURE_MECHANICAL_BOUNDS.baseOffset +
    safeRaw * APERTURE_MECHANICAL_BOUNDS.rawSlope;
  return Math.min(
    APERTURE_MECHANICAL_BOUNDS.maxScale,
    Math.max(APERTURE_MECHANICAL_BOUNDS.minScale, mapped)
  );
}

export function computeAlertApertureTarget(
  elapsedTime: number,
  pulseRate: number,
  fallbackAperture: number,
  prefersReducedMotion: boolean
): number {
  if (prefersReducedMotion) {
    return fallbackAperture;
  }
  const rate = Math.max(1.0, Number.isFinite(pulseRate) ? pulseRate : 6.0);
  const phase = elapsedTime * rate * Math.PI * 2.0;
  const compositeWave = Math.sin(phase) + 0.45 * Math.sin(phase * 1.732 + 0.8);
  return compositeWave >= 0.0 ? 1.2 : 0.7;
}

export function createReactorStateDriver(params: ReactorStateDriverParams) {
  const {
    scene,
    camera,
    renderer,
    materials,
    lighting,
    particles,
    postfx,
    geometry,
    getReactorState,
    getIntensity,
    getCoreCenter,
    getCoreScale,
    getSettingsStore,
    getSystemStore,
    getUIStore,
    getAudioTargets,
  } = params;

  let manualPulseValue = 0.0;
  const prefersReducedMotion =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  // Smoothed Audio Levels
  let smoothBass = 0.0;
  let smoothMid = 0.0;
  let smoothTreble = 0.0;
  let smoothTotal = 0.0;
  let lastTelemetry2HzTime = 0.0;

  // Smoothed Visual Targets
  const currentVisuals: ReactorVisualTargets = {
    coreIntensity: 0.6,
    coreScale: 1.0,
    ringIntensity: 0.5,
    ringSpeed: 1.0,
    particleIntensity: 0.4,
    signalIntensity: 0.3,
    bloomStrength: 0.5,
    frameActivity: 0.2,
  };

  // Reactor State Signatures & Micro-Life Orchestration
  const currentSignature = createDefaultSignature();
  let lastObservedState = 'idle';
  let lastObservedVoice = 'IDLE';
  let idleBlinkActive = false;
  let idleBlinkEndTime = 0;
  let nextIdleBlinkTime = 8.0 + Math.random() * 10.0;
  let turbineBoostMultiplier = 1.0;
  let turbineBoostEndTime = 0;
  let neuroFiringIndex = 0;
  let apertureSpringScale = mapApertureToMechanicalScale(currentSignature.apertureOpen);
  let apertureSpringVel = 0.0;

  const clock = new THREE.Clock();

  // Cached Object References for High-Performance Animation
  const energyRods: THREE.Object3D[] = [];
  const quantumBits: THREE.Object3D[] = [];
  let coreMotesObj: THREE.Points | null = null;

  // Core 4.1 Triangular Central Chamber references
  let centralChamberRoot: THREE.Group | null = null;
  let chamberShell: THREE.Group | null = null;
  let chamberClamps: THREE.Group | null = null;
  let apertureInnerRim: THREE.Object3D | null = null;
  let triangularCoreMesh: THREE.Mesh | null = null;
  let triangularCoreBasic: THREE.Mesh | null = null;
  let plasmaWhiteCoreMesh: THREE.Mesh | null = null;
  let plasmaOuterEnvelopeMesh: THREE.Mesh | null = null;
  let plasmaContainmentFieldMesh: THREE.Mesh | null = null;
  let innerTriWireMesh: THREE.Mesh | null = null;
  let hudLensMesh: THREE.Mesh | null = null;
  let coreSpillLight: THREE.PointLight | null = null;
  const conduitRunners: THREE.Mesh[] = [];
  const portDiodes: THREE.Mesh[] = [];
  const bearingIndicators: THREE.Mesh[] = [];
  const innerEdgeTubes: THREE.Mesh[] = [];
  let secondaryConduitIndicatorMesh: THREE.Mesh | null = null;
  const outerClampLights: THREE.PointLight[] = [];

  let primaryRingGroup: THREE.Group | null = null;
  let secondaryRingGroup: THREE.Group | null = null;
  let dataOrbitGroup: THREE.Group | null = null;
  const vertexLights: THREE.PointLight[] = [];
  const processNodes: THREE.Group[] = [];
  const processNodeCache: { screen: THREE.Mesh | null; led: THREE.Mesh | null }[] = [];
  const unlitTubeColor = new THREE.Color(0x2a080c);
  const unlitFacetedColor = new THREE.Color(0x050508);
  const unlitGlassColor = new THREE.Color(0x0e0c12);
  const unlitBlack = new THREE.Color(0x000000);
  const whiteHotBaseColor = new THREE.Color(0xfff4f2);
  const warmSpillTint = new THREE.Color(0xff6020);

  const tempCenterColor = new THREE.Color();
  const tempTrenchColor = new THREE.Color();
  const tempRingColor = new THREE.Color();
  const tempOuterColor = new THREE.Color();

  // Set invariant brand color

  let powerEnvelope = 1.0;

  function smoothStepStage(val: number, min: number, max: number): number {
    if (val <= min) return 0.0;
    if (val >= max) return 1.0;
    const t = (val - min) / (max - min);
    return t * t * (3 - 2 * t);
  }

  geometry.reactorGroup.traverse((child) => {
    if (child.name === "energyRod") energyRods.push(child);
    if (child.name === "quantumBit") quantumBits.push(child);
    if (child.name === "arc-core-motes") coreMotesObj = child as THREE.Points;
    if (child.name === "arc-central-chamber-root") centralChamberRoot = child as THREE.Group;
    if (child.name === "arc-chamber-shell") chamberShell = child as THREE.Group;
    if (child.name === "arc-chamber-clamps") chamberClamps = child as THREE.Group;
    if (child.name === "arc-aperture-inner-rim") apertureInnerRim = child;
    if (child.name === "arc-triangular-core-mesh") triangularCoreMesh = child as THREE.Mesh;
    if (child.name === "arc-triangular-core-basic") triangularCoreBasic = child as THREE.Mesh;
    if (child.name === "arc-plasma-white-core") plasmaWhiteCoreMesh = child as THREE.Mesh;
    if (child.name === "arc-plasma-outer-envelope") {
      plasmaOuterEnvelopeMesh = child as THREE.Mesh;
      if (materials.plasmaOuterEnvelopeMat) {
        plasmaOuterEnvelopeMesh.material = materials.plasmaOuterEnvelopeMat;
      }
    }
    if (child.name === "arc-plasma-containment-field") plasmaContainmentFieldMesh = child as THREE.Mesh;
    if (child.name === "arc-inner-wire-triangle") innerTriWireMesh = child as THREE.Mesh;
    if (child.name === "arc-core-hud-lens") hudLensMesh = child as THREE.Mesh;
    if (child.name === "arc-core-spill-light") coreSpillLight = child as THREE.PointLight;
    if (child.name.startsWith("arc-conduit-runner-")) conduitRunners.push(child as THREE.Mesh);
    if (child.name.startsWith("arc-inner-plasma-tube-")) {
      const idx = parseInt(child.name.replace("arc-inner-plasma-tube-", ""), 10);
      innerEdgeTubes[idx] = child as THREE.Mesh;
    }
    if (child.name.startsWith("arc-inner-port-diode-")) {
      const idx = parseInt(child.name.replace("arc-inner-port-diode-", ""), 10);
      portDiodes[idx] = child as THREE.Mesh;
    }
    if (child.name === "arc-bearing-indicators-ring") {
      bearingIndicators[0] = child as THREE.Mesh;
    } else if (child.name.startsWith("arc-bearing-indicator-")) {
      const idx = parseInt(child.name.replace("arc-bearing-indicator-", ""), 10);
      bearingIndicators[idx] = child as THREE.Mesh;
    }
    if (child.name === "arc-merged-trenches-secondaryIndicator") {
      secondaryConduitIndicatorMesh = child as THREE.Mesh;
    }
    if (child.name.startsWith("arc-vertex-light-")) {
      const idx = parseInt(child.name.replace("arc-vertex-light-", ""), 10);
      vertexLights[idx] = child as THREE.PointLight;
    }
    if (child.name.startsWith("arc-clamp-light-")) {
      const idx = parseInt(child.name.replace("arc-clamp-light-", ""), 10);
      outerClampLights[idx] = child as THREE.PointLight;
    }
    if (child.name === "arc-containment-ring-primary") primaryRingGroup = child as THREE.Group;
    if (child.name === "arc-containment-ring-secondary") secondaryRingGroup = child as THREE.Group;
    if (child.name === "arc-data-orbit") dataOrbitGroup = child as THREE.Group;
    if (child.name.startsWith("arc-process-node-")) processNodes.push(child as THREE.Group);
  });

  processNodes.forEach((node, idx) => {
    processNodeCache.push({
      screen: node.getObjectByName(`arc-node-screen-${idx}`) as THREE.Mesh,
      led: node.getObjectByName(`arc-node-led-${idx}`) as THREE.Mesh,
    });
  });

  // Viewport-aware reactor scale helper: increases displayed reactor scale by ~10% (8-12% target)
  // when viewport dimensions allow, while enforcing safe clearance from bottom dock, top bar, and side edges
  // (including narrow portrait/mobile viewports where width is the limiting dimension).
  const computeViewportTransform = (
    centerProp: { x: number; y: number } | undefined,
    scaleProp: number | undefined
  ): { x: number; y: number; scale: number } => {
    const baseScale = scaleProp !== undefined ? scaleProp : 1.0;
    if (typeof window === "undefined") {
      return { x: 0, y: 0, scale: baseScale * 1.10 };
    }
    const winW = Math.max(window.innerWidth || 1280, 1);
    const winH = Math.max(window.innerHeight || 800, 1);
    const camZ = camera ? Math.max(20, camera.position.z) : 41.2;
    const fov = camera ? camera.fov : 24;
    const aspect = camera && camera.aspect > 0 ? camera.aspect : winW / winH;

    return computeReactorViewportTransform({
      winW,
      winH,
      camZ,
      fov,
      aspect,
      centerProp,
      scaleProp,
    });
  };

  // Set initial position and viewport-safe scale right away
  const initTransform = computeViewportTransform(getCoreCenter(), getCoreScale());
  geometry.reactorGroup.position.x = initTransform.x;
  geometry.reactorGroup.position.y = initTransform.y;
  geometry.reactorGroup.scale.setScalar(initTransform.scale);

  let fpsFrameCount = 0;
  let fpsTime = performance.now();
  let currentFps = 60;
  let lastFrameExecMs = 2.0;

  const triggerPulse = () => {
    manualPulseValue = 1.0;
  };

  const triggerOutwardEnergyPulse = (conduitIdx: number) => {
    // Find a dormant or dissipating energy runner in the outer glass ring
    const dormantRunner = geometry.lightRunners.find(
      (r) =>
        r.group.userData.state === "dormant" ||
        r.group.userData.state === "dissipating"
    );
    if (dormantRunner) {
      const uData = dormantRunner.group.userData;
      const baseAngles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
      const targetAngle = baseAngles[conduitIdx % 3];

      dormantRunner.group.rotation.z = targetAngle;

      uData.direction = Math.random() > 0.45 ? 1 : -1;
      uData.baseSpeed = uData.direction * (0.28 + Math.random() * 0.25);
      uData.state = "igniting";
      uData.timer = 0.25 + Math.random() * 0.25;
      uData.maxLife = 1.8 + Math.random() * 1.4;
      uData.pulseOffset = Math.random() * 10;
      uData.opacity = Math.max(uData.opacity || 0, 0.25);
    }
  };

  const updateFrame = (delta: number) => {
    const perfNow = performance.now();
    const elapsedTime = clock.getElapsedTime();
    const settingsStore = getSettingsStore();
    const uiStore = getUIStore();
    const systemStore = getSystemStore();

    const diagFlags = getActiveDiagnosticFlags();

    // 1. Dynamic Performance Scaling (FPS Regulator) — throttled update (>= 250ms)
    fpsFrameCount++;
    if (perfNow - fpsTime >= 250) {
      currentFps = (fpsFrameCount * 1000) / (perfNow - fpsTime);
      fpsFrameCount = 0;
      fpsTime = perfNow;

      const sparkDraw = particles.sparksSystem && particles.sparksSystem.visible ? particles.sparksSystem.geometry.drawRange.count : 0;
      const dustDraw = particles.dustParticles && particles.dustParticles.visible ? particles.dustParticles.geometry.drawRange.count : 0;
      const bokehObj = particles.sparksSystem?.userData?.bokehSystem as THREE.Points | undefined;
      const bokehDraw = bokehObj && bokehObj.visible ? bokehObj.geometry.drawRange.count : 0;
      const activeTotalParticles =
        particles.sparksSystem && !particles.sparksSystem.visible
          ? 0
          : sparkDraw > 0 && sparkDraw < 99999
            ? sparkDraw + dustDraw + bokehDraw
            : diagFlags.useLegacyParticleBudget
              ? 88
              : 204;

      const measuredFps = Math.round(currentFps);
      const measuredFrameTime = parseFloat((1000 / Math.max(1, currentFps)).toFixed(1));
      const measuredThreeTime = parseFloat(lastFrameExecMs.toFixed(1));
      const measuredDrawCalls = params.renderer?.info.render.calls || 12;

      uiStore.updateProfilerStats({
        fps: measuredFps,
        frameTime: measuredFrameTime,
        dpr: parseFloat((params.renderer?.getPixelRatio() || 1).toFixed(2)),
        drawCalls: measuredDrawCalls,
        particleCount: activeTotalParticles,
        threeUpdateTime: measuredThreeTime,
      });

      recordDiagnosticFrameSample({
        fps: measuredFps,
        frameTime: measuredFrameTime,
        threeUpdateTime: measuredThreeTime,
        drawCalls: measuredDrawCalls,
        particleCount: activeTotalParticles,
        cpuLoad: systemStore?.metrics?.cpuLoad ?? systemStore?.cpuUsage ?? uiStore.profilerStats.cpuLoad,
        gpuLoad: systemStore?.metrics?.gpuLoad ?? uiStore.profilerStats.gpuLoad,
      });
    }

    // 2. Compute Audio Bands & Visual Targets
    const state = getReactorState();
    const voiceState = params.getVoiceState ? params.getVoiceState() : 'IDLE';

    // Wake Word Attention-Snap (FSM IDLE -> TRIGGERED or IDLE -> LISTENING)
    const isWakeSnap =
      (voiceState === 'TRIGGERED' && lastObservedVoice !== 'TRIGGERED') ||
      (state === 'listening' && lastObservedState === 'idle');

    if (isWakeSnap) {
      turbineBoostMultiplier = 1.30;
      turbineBoostEndTime = elapsedTime + 0.30; // 300ms +30% RPM boost
      geometry.lightRunners.forEach((runner) => {
        const uData = runner.group.userData;
        uData.state = 'igniting';
        uData.timer = 0.35;
        uData.opacity = 0.95;
      });
    }
    if (lastObservedState !== state) {
      const sig = resolveSignatureForState(state);
    }
    lastObservedVoice = voiceState;
    lastObservedState = state;

    // Decay turbine boost back to 1.0
    if (elapsedTime >= turbineBoostEndTime && turbineBoostMultiplier > 1.0) {
      turbineBoostMultiplier = Math.max(1.0, turbineBoostMultiplier - delta * 2.0);
    }

    // Resolve & Lerp State Signature Vector (tau = 0.15s, instant error tau = 0.02s)
    const targetSignature = resolveSignatureForState(state);
    const isInstantTransition = (state === 'alert' || state === 'error');
    lerpSignature(currentSignature, targetSignature, delta, isInstantTransition);

    // IDLE Micro-Life (core flash 80-150ms every 8-20s, skipped under high compute load)
    const isHighCompute = Boolean(uiStore && uiStore.isHighComputeLoad);
    if (state === 'idle' && !isHighCompute) {
      if (!idleBlinkActive && elapsedTime >= nextIdleBlinkTime) {
        idleBlinkActive = true;
        idleBlinkEndTime = elapsedTime + 0.12; // 120ms flash
      } else if (idleBlinkActive && elapsedTime >= idleBlinkEndTime) {
        idleBlinkActive = false;
        nextIdleBlinkTime = elapsedTime + 8.0 + Math.random() * 12.0; // 8-20s interval
      }
    } else {
      idleBlinkActive = false;
    }
    if (idleBlinkActive) {
      manualPulseValue = Math.max(manualPulseValue, 0.75);
    }

    // Color Theme Lerp (300ms transition) — ensure targetColor always matches active store theme
    const expectedThemeHex = themeAccentHex(settingsStore.reactorColorTheme);
    if (materials.targetColor.getHex() !== expectedThemeHex) {
      materials.targetColor.setHex(expectedThemeHex);
    }
    materials.currentColor.lerp(materials.targetColor, Math.min(delta * 5.0, 1.0));

    // Active reactor theme color
    const activeColor = materials.currentColor;

    const rawAudio = getAudioTargets ? getAudioTargets() : { bassTarget: 0, midTarget: 0, trebleTarget: 0, currentAudioTarget: 0 };
    const audioBands: AudioBands = {
      bass: Number.isFinite(rawAudio?.bassTarget) ? rawAudio.bassTarget : 0,
      mid: Number.isFinite(rawAudio?.midTarget) ? rawAudio.midTarget : 0,
      treble: Number.isFinite(rawAudio?.trebleTarget) ? rawAudio.trebleTarget : 0,
      total: Number.isFinite(rawAudio?.currentAudioTarget) ? rawAudio.currentAudioTarget : 0,
    };

    // Exponential Smoothing for Audio Bands (attack ~60ms, decay ~250ms per ТЗ-ДЕЛЬТА 4)
    const audioAttackSpeed = 16.6;
    const audioDecaySpeed = 4.0;
    smoothBass = exponentialSmooth(smoothBass || 0, audioBands.bass, audioBands.bass > (smoothBass || 0) ? audioAttackSpeed : audioDecaySpeed, delta) || 0;
    smoothMid = exponentialSmooth(smoothMid || 0, audioBands.mid, audioBands.mid > (smoothMid || 0) ? audioAttackSpeed : audioDecaySpeed, delta) || 0;
    smoothTreble = exponentialSmooth(smoothTreble || 0, audioBands.treble, audioBands.treble > (smoothTreble || 0) ? audioAttackSpeed : audioDecaySpeed, delta) || 0;
    smoothTotal = exponentialSmooth(smoothTotal || 0, audioBands.total, audioBands.total > (smoothTotal || 0) ? audioAttackSpeed : audioDecaySpeed, delta) || 0;

    const smoothedBands: AudioBands = {
      bass: smoothBass,
      mid: smoothMid,
      treble: smoothTreble,
      total: smoothTotal,
    };

    const targetProps = computeReactorVisualTargets(
      state,
      settingsStore.reactorPower,
      settingsStore.reactorSpeed,
      smoothedBands,
      getIntensity()
    );

    // Power down the reactor visually only if power is zero or state is explicitly 'off'
    const isLightOff = state === 'off' || settingsStore.reactorPower <= 0.001;
    if (isLightOff) {
      targetProps.coreIntensity = 0.0;
      targetProps.ringIntensity = 0.0;
      targetProps.particleIntensity = 0.0;
      targetProps.signalIntensity = 0.0;
      targetProps.bloomStrength = 0.0;
    }

    // Smooth Visual Target Transitions
    currentVisuals.coreIntensity = exponentialSmooth(currentVisuals.coreIntensity, targetProps.coreIntensity, 6.0, delta);
    currentVisuals.coreScale = exponentialSmooth(currentVisuals.coreScale, targetProps.coreScale, 6.0, delta);
    currentVisuals.ringIntensity = exponentialSmooth(currentVisuals.ringIntensity, targetProps.ringIntensity, 6.0, delta);
    currentVisuals.ringSpeed = exponentialSmooth(currentVisuals.ringSpeed, targetProps.ringSpeed, 6.0, delta);
    currentVisuals.particleIntensity = exponentialSmooth(currentVisuals.particleIntensity, targetProps.particleIntensity, 6.0, delta);
    currentVisuals.signalIntensity = exponentialSmooth(currentVisuals.signalIntensity, targetProps.signalIntensity, 6.0, delta);
    currentVisuals.bloomStrength = exponentialSmooth(currentVisuals.bloomStrength, targetProps.bloomStrength, 5.0, delta);
    currentVisuals.frameActivity = exponentialSmooth(currentVisuals.frameActivity, targetProps.frameActivity, 6.0, delta);

    // Decay manual pulse value
    manualPulseValue = Math.max(0.0, manualPulseValue - delta * 2.5);

    // 3. Theme Overload Effects (Color is constant, intensity changes)
    const cpuLoad = systemStore.cpuUsage || 10;
    const ramUsage = systemStore.ramUsage || 20;
    const isOverloadedState = state === "alert";

    if (isOverloadedState) {
      // Simulate flicker and overload with manual pulse injection
      manualPulseValue = Math.max(manualPulseValue, Math.random() > 0.5 ? 0.3 : 0.0);
    }

    // Master Staged Power Ignition & Shutdown Envelope (0.0 = total dormancy, 1.0 = full operation)
    const targetIgnition = isLightOff ? 0.0 : 1.0;
    // Smooth transition for cinematic staged propagation (faster to prevent "too slow" feeling)
    powerEnvelope = exponentialSmooth(powerEnvelope, targetIgnition, 4.0, delta);
    if (powerEnvelope < 0.0005) powerEnvelope = 0.0;

    // 4 Spatial Staged Activation Waves (Center -> Trench/Plasma -> Containment Rings -> Outer Perimeter/Locks):
    // Stage 1 (Center / Singularity / Chamber): 0.00 -> 0.45
    const stageCenter = smoothStepStage(powerEnvelope, 0.00, 0.45);
    // Stage 2 (Trench Waveguides & Plasma Vortex): 0.20 -> 0.70
    const stageTrench = smoothStepStage(powerEnvelope, 0.20, 0.70);
    // Stage 3 (Containment Rings & Conduits & Sparks): 0.45 -> 0.88
    const stageRings = smoothStepStage(powerEnvelope, 0.45, 0.88);
    // Stage 4 (Outer Perimeter Clamps & Vertex Lights & Bloom): 0.65 -> 1.00
    const stageOuter = smoothStepStage(powerEnvelope, 0.65, 1.00);

    const isGlowActive = powerEnvelope > 0.0008;
    const masterGlow = powerEnvelope;

    // Prepare smoothly interpolated base diffuse colors for each spatial stage (Zero allocations)
    tempCenterColor.copy(unlitTubeColor).lerp(activeColor, stageCenter * 0.85);
    tempTrenchColor.copy(unlitTubeColor).lerp(activeColor, stageTrench * 0.85);
    tempRingColor.copy(unlitTubeColor).lerp(activeColor, stageRings * 0.85);
    tempOuterColor.copy(unlitGlassColor).lerp(activeColor, stageOuter * 0.15);

    // Zone focus dynamic multipliers (Block B & C)
    let latticeFocus = currentSignature.zoneFocus ? currentSignature.zoneFocus.lattice : 1.0;
    if (state === 'listening') {
      // СЛУШАЮ: lattice-«ухо»: opacity проволоки пропорциональна уровню микрофона
      latticeFocus *= (0.2 + smoothTotal * 3.0);
    }

    let ringsFocus = currentSignature.zoneFocus ? currentSignature.zoneFocus.rings : 1.0;
    if (state === 'speaking') {
      // ГОВОРЮ: огибающая реального спектра bass
      ringsFocus *= (0.5 + smoothBass * 1.5);
    }

    if (state === 'alert' || state === 'error') {
      const strobe = prefersReducedMotion
        ? 0.9 + Math.sin(elapsedTime * 2.5) * 0.15
        : (Math.random() > 0.5 ? 1.45 : 0.25);
      latticeFocus *= strobe;
      ringsFocus *= strobe;
    }

    const gfx: GraphicsConfig | undefined = params.getEffectiveConfig
      ? params.getEffectiveConfig()
      : settingsStore.graphicsConfig;
    const isBloomDisabled = gfx ? !gfx.bloomEnabled : settingsStore.graphicsQuality === "Low";
    postfx.bloomPass.enabled = !isBloomDisabled;
    if (gfx && typeof gfx.bloomRadius === "number") {
      const clampedR = Math.max(0.2, Math.min(0.8, gfx.bloomRadius));
      postfx.bloomPass.radius = 0.18 + ((clampedR - 0.2) / 0.6) * 0.14;
    }
    if (gfx && typeof gfx.bloomThreshold === "number") {
      postfx.bloomPass.threshold = Math.max(0.58, Math.min(0.85, gfx.bloomThreshold));
    }
    const bloomOffEmissiveBoost = isBloomDisabled ? 1.25 : 1.0;

    // Ensure all 3 inner edge tubes are cached (fallback lookup via scene.getObjectByName)
    for (let tIdx = 0; tIdx < 3; tIdx++) {
      if (!innerEdgeTubes[tIdx]) {
        const found = scene.getObjectByName(`arc-inner-plasma-tube-${tIdx}`) as THREE.Mesh | undefined;
        if (found) innerEdgeTubes[tIdx] = found;
      }
    }

    // Emissive and Surface Material Color sync for ALL reactor components with phased spatial staging
    if (!isGlowActive) {
      // Complete dark/off resting state: unlit dark glass & tubes without emission
      materials.neonTubeMat.color.copy(unlitTubeColor);
      materials.neonTubeMat.emissive.setHex(0x000000);
      materials.neonTubeMat.emissiveIntensity = 0.0;

      try {
        for (let idx = 0; idx < 3; idx++) {
          const tube = innerEdgeTubes[idx];
          if (tube?.material instanceof THREE.MeshStandardMaterial) {
            tube.material.color.copy(unlitTubeColor);
            tube.material.emissive.setHex(0x000000);
            tube.material.emissiveIntensity = 0.0;
          }
        }
      } catch (err) {
        console.warn("[ReactorStateDriver] innerEdgeTubes reset error:", err);
      }

      materials.coreDiodeMat.color.copy(unlitTubeColor);
      materials.coreDiodeMat.emissive.setHex(0x000000);
      materials.coreDiodeMat.emissiveIntensity = 0.0;

      materials.ringFrameMat.emissive.setHex(0x000000);
      materials.ringFrameMat.emissiveIntensity = 0.0;

      materials.singularityFacetedMat.color.copy(unlitFacetedColor);
      materials.singularityFacetedMat.emissive.setHex(0x000000);
      materials.singularityFacetedMat.emissiveIntensity = 0.0;

      materials.singularityCoreEmissiveMat.color.setHex(0x000000);
      materials.singularityCoreEmissiveMat.emissive.setHex(0x000000);
      materials.singularityCoreEmissiveMat.emissiveIntensity = 0.0;

      materials.singularityInnerWireMat.color.setHex(0x000000);
      materials.singularityInnerWireMat.opacity = 0.0;
      materials.singularityPointMat.opacity = 0.0;

      materials.plasmaVortexMat.opacity = 0.0;
      materials.plasmaVortexMat.emissive.setHex(0x000000);
      materials.plasmaVortexMat.emissiveIntensity = 0.0;
      if (materials.plasmaOuterEnvelopeMat) {
        materials.plasmaOuterEnvelopeMat.opacity = 0.0;
        materials.plasmaOuterEnvelopeMat.emissive.setHex(0x000000);
        materials.plasmaOuterEnvelopeMat.emissiveIntensity = 0.0;
      }
      if (plasmaOuterEnvelopeMesh) plasmaOuterEnvelopeMesh.visible = false;
      if (coreSpillLight) {
        coreSpillLight.intensity = 0.0;
        coreSpillLight.visible = false;
      }

      for (let bIdx = 0; bIdx < 3; bIdx++) {
        const bMat = bearingIndicators[bIdx]?.material;
        if (bMat instanceof THREE.MeshStandardMaterial) {
          bMat.color.copy(unlitTubeColor);
          bMat.emissive.setHex(0x000000);
          bMat.emissiveIntensity = 0.0;
        }
      }
      if (secondaryConduitIndicatorMesh?.material instanceof THREE.MeshStandardMaterial) {
        secondaryConduitIndicatorMesh.material.color.copy(unlitTubeColor);
        secondaryConduitIndicatorMesh.material.emissive.setHex(0x000000);
        secondaryConduitIndicatorMesh.material.emissiveIntensity = 0.0;
      }

      materials.energyWaveMat.opacity = 0.0;
      materials.energyArcMat.opacity = 0.0;
      materials.coronaMat.opacity = 0.0;

      materials.criticalWhite.emissive.setHex(0x000000);
      materials.criticalWhite.emissiveIntensity = 0.0;

      materials.outerGlassRingMat.color.copy(unlitGlassColor);
    } else {
      // Stage 1: Primary Volumetric Plasma Source (White-Hot Center + Saturated Crimson Envelope)
      materials.singularityCoreEmissiveMat.color.copy(unlitBlack).lerp(activeColor, stageCenter);
      materials.singularityCoreEmissiveMat.emissive.copy(activeColor);

      // White-hot inner plasma core tint & controlled animated intensity
      materials.singularityPointMat.color.copy(whiteHotBaseColor).lerp(activeColor, 0.24);
      materials.singularityPointMat.opacity = Math.min(
        0.96,
        (0.76 + currentVisuals.coreIntensity * 0.14 + smoothBass * 0.10 + manualPulseValue * 0.08) * stageCenter
      );

      materials.singularityInnerWireMat.color.copy(activeColor);
      materials.singularityInnerWireMat.opacity = Math.min(0.38, (0.20 + smoothTotal * 0.18 + smoothBass * 0.10) * stageCenter);

      materials.singularityFacetedMat.color.copy(unlitFacetedColor).lerp(activeColor, stageCenter * 0.18);
      materials.singularityFacetedMat.emissive.copy(activeColor);
      materials.singularityFacetedMat.emissiveIntensity =
        (0.24 + currentVisuals.coreIntensity * 0.10 + smoothTotal * 0.20) * stageCenter * bloomOffEmissiveBoost;

      // Stage 2: Primary Energy Distribution Channels, Waveguides, Electromagnetic Containment Field & Port Diodes
      // Emissive hierarchy: Primary Plasma > Inner Tubes (~0.54) > Primary Channels (~0.48) > Bearings (~0.32)
      const lightTier = gfx?.dynamicPointLights ?? "standard";
      const isFullPerimeterLights = diagFlags.overrideActive
        ? diagFlags.enablePerimeterPointLights
        : lightTier === "full" || diagFlags.enablePerimeterPointLights;
      const perimeterLightComp = isFullPerimeterLights ? 0.0 : 0.04;
      materials.neonTubeMat.color.copy(tempTrenchColor);
      materials.neonTubeMat.emissive.copy(activeColor);
      const baseTubeIntensity = (0.48 + perimeterLightComp + smoothTotal * 0.28 + smoothBass * 0.22 + manualPulseValue * 0.20) * stageTrench * bloomOffEmissiveBoost;
      materials.neonTubeMat.emissiveIntensity = baseTubeIntensity;

      // Secondary segmented conduit indicator channel: noticeably less luminous (~42% of primary conductor)
      if (secondaryConduitIndicatorMesh?.material instanceof THREE.MeshStandardMaterial) {
        secondaryConduitIndicatorMesh.material.color.copy(tempTrenchColor);
        secondaryConduitIndicatorMesh.material.emissive.copy(activeColor);
        secondaryConduitIndicatorMesh.material.emissiveIntensity = baseTubeIntensity * 0.42;
      }

      // Idea 8: 3-Band Spatial Audio Mapping across the 3 inner triangle plasma tubes (bass, mid, treble)
      try {
        const use3Band = !gfx || gfx.spatialAudioBands !== false;
        const bass = smoothBass || 0;
        const mid = smoothMid || 0;
        const treble = smoothTreble || 0;
        const bandValues = use3Band ? [bass, mid, treble] : [smoothTotal, smoothTotal, smoothTotal];
        const innerBaseIntensity = (0.54 + perimeterLightComp + smoothTotal * 0.30 + manualPulseValue * 0.22) * stageTrench * bloomOffEmissiveBoost;
        const freqMultiplier = 0.32 * stageTrench * bloomOffEmissiveBoost;
        for (let idx = 0; idx < 3; idx++) {
          const tube = innerEdgeTubes[idx];
          if (tube?.material instanceof THREE.MeshStandardMaterial) {
            tube.material.color.copy(tempTrenchColor);
            tube.material.emissive.copy(activeColor);
            tube.material.emissiveIntensity = innerBaseIntensity + (bandValues[idx] || 0) * freqMultiplier;
          }
        }
      } catch (err) {
        console.warn("[ReactorStateDriver] innerEdgeTubes audio update error:", err);
      }

      materials.coreDiodeMat.color.copy(tempTrenchColor);
      materials.coreDiodeMat.emissive.copy(activeColor);
      materials.coreDiodeMat.emissiveIntensity = (0.46 + perimeterLightComp + smoothBass * 0.28 + manualPulseValue * 0.18) * stageTrench * bloomOffEmissiveBoost;

      // Synchronized Bearing Status Indicators (tertiary emissive level phased with rotor azimuth & plasma activity)
      const rotorAzimuth = geometry.internalTurbine.rotation.z;
      for (let bIdx = 0; bIdx < 3; bIdx++) {
        const bMat = bearingIndicators[bIdx]?.material;
        if (bMat instanceof THREE.MeshStandardMaterial) {
          const bearingPhase = 0.5 + 0.5 * Math.sin(rotorAzimuth * 3.0 + (bIdx * Math.PI * 2) / 3);
          bMat.color.copy(tempTrenchColor);
          bMat.emissive.copy(activeColor);
          bMat.emissiveIntensity =
            (0.32 + bearingPhase * 0.16 + smoothMid * 0.20 + currentVisuals.coreIntensity * 0.10) *
            stageRings *
            bloomOffEmissiveBoost;
        }
      }

      // Independent Rear Outer Energy Envelope (renderOrder = 1)
      if (materials.plasmaOuterEnvelopeMat) {
        materials.plasmaOuterEnvelopeMat.color.copy(activeColor);
        materials.plasmaOuterEnvelopeMat.emissive.copy(activeColor);
        materials.plasmaOuterEnvelopeMat.emissiveIntensity =
          (0.95 + currentVisuals.coreIntensity * 0.35 + smoothTotal * 0.55 + smoothBass * 0.35 + manualPulseValue * 0.30) *
          stageCenter *
          bloomOffEmissiveBoost;
        materials.plasmaOuterEnvelopeMat.opacity = Math.min(
          0.76,
          (0.44 + currentVisuals.coreIntensity * 0.10 + smoothTotal * 0.16 + smoothBass * 0.10) * stageCenter
        );
      }

      // Independent Front Containment Field (renderOrder = 4, crisp magnetic filaments)
      materials.plasmaVortexMat.color.copy(activeColor);
      materials.plasmaVortexMat.emissive.copy(activeColor);
      materials.plasmaVortexMat.emissiveIntensity = (0.86 + smoothTotal * 0.50 + smoothBass * 0.20) * stageTrench * bloomOffEmissiveBoost;
      materials.plasmaVortexMat.opacity = Math.min(0.46, (0.28 + smoothTotal * 0.14 + smoothBass * 0.06) * stageTrench);

      // Stage 3: Containment Rings, Energy Conduits & Wavefields
      // Keep gunmetal structural supports strictly non-emissive so red light only reflects physically from energy elements
      materials.ringFrameMat.emissive.setHex(0x000000);
      materials.ringFrameMat.emissiveIntensity = 0.0;

      materials.energyWaveMat.color.copy(activeColor);
      const shockwaveFactor = !gfx || gfx.shockwavesEnabled !== false ? 1.0 + manualPulseValue * 0.40 : 0.25;
      materials.energyWaveMat.opacity = (0.12 + smoothBass * 0.24) * stageRings * shockwaveFactor;
      materials.energyArcMat.color.copy(activeColor);
      materials.energyArcMat.opacity = 0.16 * stageRings;
      materials.coronaMat.color.copy(activeColor);
      materials.coronaMat.opacity = 0.14 * stageRings;

      // Stage 4: Outer Perimeter, Locks, Outer Glass Tint & Critical Accents
      materials.outerGlassRingMat.color.copy(tempOuterColor);
      materials.criticalWhite.emissive.copy(activeColor);
      materials.criticalWhite.emissiveIntensity = 0.38 * stageOuter * currentSignature.glowIntensity * ringsFocus * bloomOffEmissiveBoost;
    }

    // Synchronize central triangular A.R.C. emblem (crisp satin titanium-silver contrast without glowing glare)
    if (materials.arcCenterLogoMat) {
      materials.arcCenterLogoMat.color.setHex(0xe2e7f0);
      materials.arcCenterLogoMat.opacity = isGlowActive
        ? Math.min(0.96, (0.82 + stageCenter * 0.13 + smoothBass * 0.01) * stageCenter)
        : 0.0;
    }

    if (triangularCoreBasic && triangularCoreBasic.material instanceof THREE.MeshBasicMaterial) {
      triangularCoreBasic.material.color.copy(activeColor);
      triangularCoreBasic.material.opacity = isGlowActive ? (0.75 + smoothTotal * 0.25) * stageCenter : 0.0;
    }

    // Animate plasma energy texture coordinates inside core
    if (materials.plasmaEnergyMap) {
      materials.plasmaEnergyMap.offset.x = (elapsedTime * 0.12 * currentVisuals.ringSpeed) % 1.0;
      materials.plasmaEnergyMap.offset.y = (elapsedTime * 0.08 * currentVisuals.ringSpeed) % 1.0;
    }

    // 4. Transform & Reactor Root Smoothing (with +10% viewport-safe responsive scaling)
    const vpTransform = computeViewportTransform(getCoreCenter(), getCoreScale());
    const targetX3d = vpTransform.x;
    const targetY3d = vpTransform.y;
    const scl = vpTransform.scale;

    geometry.reactorGroup.position.x += (targetX3d - geometry.reactorGroup.position.x) * 4.0 * delta;
    geometry.reactorGroup.position.y += (targetY3d - geometry.reactorGroup.position.y) * 4.0 * delta;
    if (currentSignature.coreJitter > 0.05 && !prefersReducedMotion) {
      const jitterMag = currentSignature.coreJitter * 0.15;
      geometry.reactorGroup.position.x += (Math.random() - 0.5) * jitterMag;
      geometry.reactorGroup.position.y += (Math.random() - 0.5) * jitterMag;
    }
    geometry.reactorGroup.scale.x += (scl - geometry.reactorGroup.scale.x) * 4.0 * delta;
    geometry.reactorGroup.scale.y += (scl - geometry.reactorGroup.scale.y) * 4.0 * delta;
    geometry.reactorGroup.scale.z += (scl - geometry.reactorGroup.scale.z) * 4.0 * delta;

    // 5. A.R.C. Core 4.3 Triangular Central Chamber State Choreography
    if (centralChamberRoot) {
      if (triangularCoreMesh) {
        let patternBoost = 0;
        if (currentSignature.pulsePattern === "irregular") {
          if (state === 'error' || state === 'alert') {
            // ОШИБКА: случайные строб-провалы 8–12 Гц
            patternBoost = (Math.random() > 0.5 ? 0.8 : -0.8) * Math.sin(elapsedTime * 10 * Math.PI * 2);
          } else {
            // ДУМАЮ: нерегулярное мерцание 2–4 Гц (шум) + двойной поисковый удар ядра каждые ~1.2 с
            const searchPhase = (elapsedTime % 1.2) / 1.2;
            const doubleBeat = (searchPhase < 0.12 || (searchPhase > 0.18 && searchPhase < 0.30)) ? 1.4 : 0.0;
            const noise = (Math.sin(elapsedTime * 3.3 * Math.PI * 2) * Math.sin(elapsedTime * 2.7 * Math.PI * 2)) * 0.4;
            patternBoost = noise + doubleBeat;
          }
        } else if (currentSignature.pulsePattern === "audio_reactive") {
          // ГОВОРЮ: огибающая реального спектра; на паузе речи пульс затухает (≥ 30% p-p)
          patternBoost = smoothBass * 1.2 + smoothMid * 0.7 + smoothTotal * 0.5;
        } else if (state === 'listening') {
          // СЛУШАЮ: ровный синус пульса + речевой всплеск от микрофона (≥ +40% на пике bass 0.9)
          const micBurst = 0.9 * smoothBass + 0.6 * smoothMid + 0.6 * smoothTotal;
          patternBoost = Math.sin(elapsedTime * Math.PI * 2 * currentSignature.pulseRate) * 0.20 + micBurst;
        } else {
          // IDLE + микрофон: дыхание 0.1 Гц + прямая реакция на голос в микрофон
          const idleMicBoost = 0.9 * smoothBass + 0.6 * smoothMid + 0.7 * smoothTotal;
          patternBoost = Math.sin(elapsedTime * Math.PI * 2 * currentSignature.pulseRate) * 0.22 + idleMicBoost;
        }
        if (isGlowActive) {
          materials.singularityCoreEmissiveMat.emissiveIntensity =
            (0.74 + currentVisuals.coreIntensity * 0.50) *
            (0.95 + patternBoost * 0.52 + manualPulseValue * 0.26) *
            stageCenter *
            bloomOffEmissiveBoost;
        } else {
          materials.singularityCoreEmissiveMat.emissiveIntensity = 0.0;
        }
        if (plasmaWhiteCoreMesh) {
          const whiteScale = prefersReducedMotion
            ? 1.0
            : 1.0 + Math.sin(elapsedTime * 6.4) * 0.04 + smoothBass * 0.08 + manualPulseValue * 0.06;
          plasmaWhiteCoreMesh.scale.setScalar(whiteScale);
        }
        if (plasmaOuterEnvelopeMesh) {
          plasmaOuterEnvelopeMesh.visible = isGlowActive;
          const envelopeScale = prefersReducedMotion
            ? 1.0
            : 1.0 + Math.sin(elapsedTime * 2.6) * 0.02 + smoothTotal * 0.035;
          plasmaOuterEnvelopeMesh.scale.setScalar(envelopeScale);
        }
        if (plasmaContainmentFieldMesh) {
          const fieldScale = prefersReducedMotion
            ? 1.0
            : 1.0 + Math.cos(elapsedTime * 4.2) * 0.03 + smoothTotal * 0.05;
          plasmaContainmentFieldMesh.scale.setScalar(fieldScale);
        }
        if (innerTriWireMesh) {
          if (gfx?.sphericalHarmonics) {
            const harmScale = 1.0 + Math.sin(elapsedTime * 5.2) * (0.02 + smoothBass * 0.06);
            innerTriWireMesh.scale.setScalar(harmScale);
          } else {
            innerTriWireMesh.scale.setScalar(1.0);
          }
        }
      }

      if (hudLensMesh) {
        if (hudLensMesh.material instanceof THREE.MeshBasicMaterial) {
          hudLensMesh.material.color.copy(activeColor);
        }
      }

      if (apertureInnerRim) {
        const baseAperture =
          state === 'error' || state === 'alert'
            ? computeAlertApertureTarget(
                elapsedTime,
                currentSignature.pulseRate,
                currentSignature.apertureOpen,
                prefersReducedMotion
              )
            : currentSignature.apertureOpen;
        const rawAperture =
          baseAperture + smoothTreble * 0.15 + (idleBlinkActive ? 0.15 : 0);
        const targetAperture = mapApertureToMechanicalScale(rawAperture);
        if (!gfx || gfx.springPhysics !== false) {
          const springDt = Math.min(Math.max(0.0, delta), 0.033);
          const force = (targetAperture - apertureSpringScale) * 140.0;
          apertureSpringVel =
            (apertureSpringVel + force * springDt) * Math.exp(-12.0 * springDt);
          apertureSpringScale += apertureSpringVel * springDt;
          if (apertureSpringScale < APERTURE_MECHANICAL_BOUNDS.minScale) {
            apertureSpringScale = APERTURE_MECHANICAL_BOUNDS.minScale;
            if (apertureSpringVel < 0) apertureSpringVel = 0;
          } else if (apertureSpringScale > APERTURE_MECHANICAL_BOUNDS.maxScale) {
            apertureSpringScale = APERTURE_MECHANICAL_BOUNDS.maxScale;
            if (apertureSpringVel > 0) apertureSpringVel = 0;
          }
          apertureInnerRim.scale.set(apertureSpringScale, apertureSpringScale, 1.0);
        } else {
          apertureSpringScale = targetAperture;
          apertureSpringVel = 0;
          apertureInnerRim.scale.set(targetAperture, targetAperture, 1.0);
        }
      }

      // Deterministic Conduit Curves & Outward Energy Flow ("Питает большой треугольник")
      // Port start points (Vertices of Central Triangle: 270°, 30°, 150°)
      const portStarts = [
        { x: 0, y: -2.25, z: 0.22 },
        { x: 1.948, y: 1.125, z: 0.22 },
        { x: -1.948, y: 1.125, z: 0.22 },
      ];
      const extEnds = [
        { x: 0, y: -4.85, z: 0.35 },
        { x: 4.200, y: 2.425, z: 0.35 },
        { x: -4.200, y: 2.425, z: 0.35 },
      ];
      const midPoints = [
        { x: 0, y: -3.55, z: 0.40 },
        { x: 3.074, y: 1.775, z: 0.40 },
        { x: -3.074, y: 1.775, z: 0.40 },
      ];

      conduitRunners.forEach((runner, i) => {
        const pStart = portStarts[i % 3];
        const pEnd = extEnds[i % 3];
        const pMid = midPoints[i % 3];

        let u = 0;
        const spd = currentSignature.runnerSpeed;

        if (currentSignature.runnerDirection < 0) {
          // INWARD energy flow: external nodes -> ports -> triangular chamber (LISTENING)
          u = 1.0 - ((elapsedTime * spd + i * 0.33) % 1.0);
        } else if (currentSignature.pulsePattern === "irregular") {
          // Rapid searching energy transit along channels (PROCESSING)
          u = (elapsedTime * spd + i * 0.33) % 1.0;
        } else if (currentSignature.pulsePattern === "audio_reactive") {
          // OUTWARD energy flow: triangular chamber -> ports -> external nodes, accelerated by real mid (SPEAKING)
          u = (elapsedTime * (spd + smoothMid * 2.5) + i * 0.33) % 1.0;
        } else if (state === "error" || state === "alert") {
          // Stuttering error pulse
          u = (Math.sin(elapsedTime * 8.0 + i) * 0.2 + 0.5);
        } else {
          // Idle state: steady periodic outward energy runner propagation
          u = (elapsedTime * spd + i * 0.33) % 1.0;
        }

        // Quadratic Bezier Evaluation without allocations
        const w0 = (1.0 - u) * (1.0 - u);
        const w1 = 2.0 * (1.0 - u) * u;
        const w2 = u * u;

        const posX = w0 * pStart.x + w1 * pMid.x + w2 * pEnd.x;
        const posY = w0 * pStart.y + w1 * pMid.y + w2 * pEnd.y;
        const posZ = w0 * pStart.z + w1 * pMid.z + w2 * pEnd.z;

        runner.position.set(posX, posY, posZ);

        // Track pulse progression and trigger physical energy injection to the outer ring!
        if (!runner.userData) {
          runner.userData = {};
        }
        const prevU = typeof runner.userData.uVal === "number" ? runner.userData.uVal : 0;
        runner.userData.uVal = u;

        if (u >= 0.95 && prevU < 0.95) {
          triggerOutwardEnergyPulse(i % 3);
        }

        // Cause and Effect Diode activation trigger
        if (u <= 0.15 && portDiodes[i % 3]) {
          // Energy arriving at central vertex port -> crisp diode glow
          const diodeMat = portDiodes[i % 3].material;
          if (diodeMat instanceof THREE.MeshStandardMaterial) {
            diodeMat.emissiveIntensity = isGlowActive
              ? 1.55 * currentSignature.glowIntensity * stageTrench * bloomOffEmissiveBoost
              : 0.0;
          }
        }
      });

      // Synchronize vertex & clamp perimeter lights per tier:
      // eco: none | standard: 3 vertex lights | full: 3 vertex + 3 clamp lights
      const tier = gfx?.dynamicPointLights ?? "standard";
      const showVertexLights = diagFlags.overrideActive
        ? diagFlags.enablePerimeterPointLights
        : tier === "standard" || tier === "full" || diagFlags.enablePerimeterPointLights;
      const showClampLights = diagFlags.overrideActive
        ? diagFlags.enablePerimeterPointLights
        : tier === "full" || diagFlags.enablePerimeterPointLights;

      for (let d = 0; d < 3; d++) {
        const vLight = vertexLights[d];
        if (vLight) {
          if (vLight.visible !== showVertexLights) vLight.visible = showVertexLights;
          if (showVertexLights) {
            vLight.color.copy(activeColor);
            vLight.intensity =
              (0.32 + smoothTotal * 0.26 + currentVisuals.coreIntensity * 0.14) * stageOuter * currentSignature.glowIntensity;
          }
        }

        // Clamp local lights (Stage 4 - Outer Clamps)
        const cLight = outerClampLights[d];
        if (cLight) {
          if (cLight.visible !== showClampLights) cLight.visible = showClampLights;
          if (showClampLights) {
            cLight.color.copy(activeColor);
            cLight.intensity =
              (0.32 + smoothBass * 0.26 + currentVisuals.coreIntensity * 0.14) * stageOuter * currentSignature.glowIntensity;
          }
        }
      }
    }

    // 6. Stage 2 3-Tier Containment System Animation
    const loadSpeedMult = computeLoadDrivenSpeed(cpuLoad, 1.0);
    const globalSpeed = settingsStore.reactorSpeed * currentVisuals.ringSpeed * loadSpeedMult;

    if (primaryRingGroup) {
      primaryRingGroup.rotation.z -= delta * 0.45 * globalSpeed * (state === 'processing' ? 4.0 : 1.0);
    }

    if (secondaryRingGroup) {
      secondaryRingGroup.rotation.z += delta * 0.35 * globalSpeed * (state === 'processing' ? 4.0 : 1.0);
      const secPulse = Math.sin(elapsedTime * 2.8) * 0.02 + (state === 'speaking' ? smoothBass * 0.15 : smoothBass * 0.04);
      secondaryRingGroup.scale.setScalar(1.0 + secPulse);
    }

    if (dataOrbitGroup) {
      dataOrbitGroup.rotation.z -= delta * 0.75 * globalSpeed * (state === 'processing' ? 4.0 : 1.0);
    }

    // 7. Dual Turbine Counter-Rotation
    const turbineBase = currentSignature.turbineRPM * turbineBoostMultiplier;
    const midTurbineSpeed = mapMidToTurbineSpeed(smoothMid, globalSpeed * turbineBase);
    geometry.internalTurbine.rotation.z += 1.6 * midTurbineSpeed * delta;
    geometry.internalTurbineSecondary.rotation.z -= 2.3 * midTurbineSpeed * delta;
    geometry.plasmaFilaments.rotation.z += 0.9 * midTurbineSpeed * delta;

    // 8. Plasma Filaments & Energy Rods
    energyRods.forEach((rod, idx) => {
      const rodPulse = Math.sin(elapsedTime * 12 + idx * 1.5) * 0.15 + 0.85;
      rod.scale.setScalar(rodPulse + smoothTreble * 0.3);
    });

    // 9. Stage 6 Process Nodes & Signals (Using cached mesh references with isolated material clones)
    processNodes.forEach((_, idx) => {
      const cached = processNodeCache[idx];
      const nodePulse = Math.sin(elapsedTime * 4.0 + idx * 1.2) * 0.2 + 0.8;

      if (cached?.screen && cached.screen.material instanceof THREE.MeshStandardMaterial) {
        cached.screen.material.color.copy(tempTrenchColor);
        cached.screen.material.emissive.copy(activeColor);
        cached.screen.material.emissiveIntensity = isGlowActive
          ? (0.95 + currentVisuals.signalIntensity * nodePulse * 0.34) * currentSignature.glowIntensity * stageOuter * bloomOffEmissiveBoost
          : 0.0;
      }
      if (cached?.led && cached.led.material instanceof THREE.MeshStandardMaterial) {
        cached.led.material.emissive.copy(activeColor);
        cached.led.material.emissiveIntensity = isGlowActive
          ? (0.90 + smoothTreble * 0.45) * currentSignature.glowIntensity * stageOuter * bloomOffEmissiveBoost
          : 0.0;
      }
    });

    // 10. Outer Ring Energy Runners update (Organic Ignition, Circulation, and Dissipation)
    const runnerSpeedMult = computeRunnerSpeedMultiplier(ramUsage, smoothTotal);
    let ringSpeedFactor = (0.5 + currentVisuals.ringSpeed * 0.5) * (0.8 + runnerSpeedMult * 0.3) * currentSignature.runnerSpeed;
    if (isHighCompute) ringSpeedFactor *= 0.5;

    let activeRunnerCount = geometry.lightRunners.reduce((acc, r) => {
      const st = r.group.userData.state;
      return st === "active" || st === "igniting" ? acc + 1 : acc;
    }, 0);

    geometry.lightRunners.forEach((runner, idx) => {
      const uData = runner.group.userData;

      // 1. Spontaneous State Machine (dormant -> igniting -> active -> dissipating -> dormant)
      if (!uData.state) {
        uData.state = "active";
        uData.timer = 1.5 + (idx % 3);
        uData.opacity = 0.72;
      }

      if (uData.state === "dormant") {
        uData.opacity = Math.max(0.0, uData.opacity - delta * 4.0);
        uData.timer -= delta;

        // Spontaneous discharge or audio/load-triggered spark (capped to 4 active runners so outer ring stays restrained)
        const canIgnite = activeRunnerCount < 4;
        const suddenDischarge =
          canIgnite &&
          !isHighCompute &&
          ((smoothBass > 0.35 || smoothTotal > 0.25 || (state === "processing" && Math.random() < 0.25)) &&
            Math.random() < 0.14);

        if ((uData.timer <= 0 && canIgnite) || suddenDischarge) {
          activeRunnerCount++;
          // Re-spawn at a fresh random angle on the ring with a new direction and velocity
          runner.group.rotation.z = Math.random() * Math.PI * 2;
          uData.direction = Math.random() > 0.45 ? 1 : -1;
          uData.baseSpeed = uData.direction * (0.2 + Math.random() * 0.25);
          uData.state = "igniting";
          uData.timer = 0.35 + Math.random() * 0.45;
          uData.maxLife = 1.8 + Math.random() * 2.2;
          uData.pulseOffset = Math.random() * 10;
        }
      } else if (uData.state === "igniting") {
        uData.opacity = Math.min(0.82, uData.opacity + delta * 2.4);
        uData.timer -= delta;
        if (uData.timer <= 0) {
          uData.state = "active";
          uData.timer = uData.maxLife || 2.5;
        }
      } else if (uData.state === "active") {
        uData.timer -= delta;
        // Subtle organic breathing while traveling through the glass conduit
        const breath = Math.sin(elapsedTime * (uData.pulseFreq || 4.0) + (uData.pulseOffset || idx)) * 0.12;
        uData.opacity = Math.min(0.88, Math.max(0.46, 0.70 + breath + smoothTotal * 0.14));

        if (uData.timer <= 0) {
          uData.state = "dissipating";
          uData.timer = 0.5 + Math.random() * 0.6;
        }
      } else if (uData.state === "dissipating") {
        uData.opacity = Math.max(0.0, uData.opacity - delta * 2.2);
        uData.timer -= delta;
        if (uData.opacity <= 0.01 || uData.timer <= 0) {
          uData.opacity = 0.0;
          uData.state = "dormant";
          uData.timer = 0.4 + Math.random() * 1.4;
        }
      }

      // 2. Smooth, calm motion along the toroidal glass conduit
      const spd = uData.baseSpeed * ringSpeedFactor * (state === 'speaking' ? 1.0 + smoothMid * 2.0 : 1.0);
      runner.group.rotation.z += spd * delta;

      // 3. Dynamic Glow & Theme Synchronization (Stage 3 - Rings & Runners) + Dormant Visibility Culling
      const curOpacity = uData.opacity || 0;
      const isRunnerVisible = isGlowActive && stageRings > 0.001 && curOpacity > 0.002;
      if (runner.group.visible !== isRunnerVisible) {
        runner.group.visible = isRunnerVisible;
      }

      if (!isRunnerVisible) {
        runner.coreMat.opacity = 0.0;
        runner.coreMat.emissiveIntensity = 0.0;
        runner.glowMat.opacity = 0.0;
        runner.glowMat.emissiveIntensity = 0.0;
      } else {
        const pulse = Math.sin(elapsedTime * 6.0 + (uData.pulseOffset || idx)) * 0.12 + 0.86;
        const intensity = (0.86 + currentVisuals.coreIntensity * 0.52) * (0.82 + smoothTotal * 0.38) * pulse * curOpacity * stageRings * currentSignature.glowIntensity * bloomOffEmissiveBoost;

        runner.coreMat.color.copy(activeColor);
        runner.coreMat.emissive.copy(activeColor);
        runner.coreMat.emissiveIntensity = intensity * 0.96;
        runner.coreMat.opacity = Math.min(0.76, curOpacity * 0.78 * stageRings);

        runner.glowMat.color.copy(activeColor);
        runner.glowMat.emissive.copy(activeColor);
        runner.glowMat.emissiveIntensity = intensity * 0.44;
        runner.glowMat.opacity = Math.min(0.36, curOpacity * 0.38 * stageRings);
      }
    });

    // 11. Quantum Bits & Data Motes (pDensity 100 = 100% full pool; >100 boosts brightness & energy)
    const pDensity = gfx ? gfx.particleDensity : 100;
    const pFraction = Math.min(1.0, Math.max(0.0, pDensity / 100));
    const pBoost = 1.0 + Math.max(0.0, (pDensity - 100) / 100) * 0.45;

    if (pDensity > 0) {
      quantumBits.forEach((child) => {
        child.userData.angle += delta * child.userData.speed * (1.0 + smoothTotal * 3.0);
        const r = child.userData.baseRadius;
        child.position.x = Math.cos(child.userData.angle) * r;
        child.position.y = Math.sin(child.userData.angle) * r;
        const baseZ = child.userData.baseZ || 0;
        if (smoothTotal > 0.05) {
          child.position.z = baseZ + (Math.sin(elapsedTime * 8 + child.userData.phase) * 0.15) * smoothTotal;
        } else {
          child.position.z += (baseZ - child.position.z) * 0.1;
        }
      });
    }

    if (coreMotesObj) {
      coreMotesObj.visible = pDensity > 0;
      if (coreMotesObj.material instanceof THREE.PointsMaterial) {
        coreMotesObj.material.color.copy(activeColor);
      }
      if (pDensity > 0) {
        const posAttr = coreMotesObj.geometry.attributes.position;
        const vels = coreMotesObj.userData.velocities;
        const bassBoost = (state === "speaking") ? smoothBass * 4.0 : smoothTotal * 3.0;
        const bassBoost2 = (state === 'speaking') ? smoothBass * 6.0 : bassBoost;
        const moteSpeed = (1.0 + bassBoost2) * currentVisuals.particleIntensity * currentSignature.particleEmission * currentSignature.zoneFocus.particles;
        const activeMotes = Math.max(0, Math.round(posAttr.count * pFraction));
        coreMotesObj.geometry.setDrawRange(0, activeMotes);
        for (let i = 0; i < activeMotes; i++) {
          let x = posAttr.getX(i);
          let y = posAttr.getY(i);
          let z = posAttr.getZ(i);
          x += vels[i].x * delta * moteSpeed;
          y += vels[i].y * delta * moteSpeed;
          z += vels[i].z * delta * moteSpeed;
          if (z > 1.8) {
            z = 0.2;
            const phi = vels[i].seedPhi || 0;
            const rad = vels[i].seedRad || 0.3;
            x = Math.cos(phi) * rad;
            y = Math.sin(phi) * rad;
          }
          posAttr.setXYZ(i, x, y, z);
        }
        posAttr.needsUpdate = true;
      }
    }

    // Shared state & audio kinematics flags for 3-tier full-viewport particle field
    const isListeningState = state === "listening" || voiceState === "LISTENING" || voiceState === "TRIGGERED";
    const isProcessingState = state === "processing";
    const isSpeakingState = state === "speaking";
    const isAlertState = state === "alert" || state === "error";

    // 12. Tier 1 (Foreground Soft Bokeh) & Tier 2 (Bright HDR Smoldering Embers) across Full 16:9 Screen
    if (particles.sparksSystem) {
      particles.sparksSystem.visible = pDensity > 0;
      const bokehRef = particles.sparksSystem.userData.bokehSystem as THREE.Points | undefined;
      if (pDensity <= 0) {
        particles.sparksSystem.geometry.setDrawRange(0, 0);
        if (bokehRef) {
          bokehRef.visible = false;
          bokehRef.geometry.setDrawRange(0, 0);
        }
      }
      if (pDensity > 0) {
        const posAttr = particles.sparksSystem.geometry.attributes.position as THREE.BufferAttribute;
        const colAttr = particles.sparksSystem.geometry.attributes.color as THREE.BufferAttribute | undefined;
        const positions = posAttr.array as Float32Array;
        const colors = colAttr ? (colAttr.array as Float32Array) : null;
        const vels = particles.sparksSystem.userData.velocities as Float32Array | undefined;
        const phases = particles.sparksSystem.userData.phases as Float32Array | undefined;
        const freqs = particles.sparksSystem.userData.freqs as Float32Array | undefined;
        const count = posAttr.count;
        const targetSparkPool = diagFlags.useLegacyParticleBudget ? Math.min(count, 24) : count;
        const activeCount = Math.max(0, Math.round(targetSparkPool * pFraction));
        particles.sparksSystem.geometry.setDrawRange(0, activeCount);

        const speedMult = (0.95 + smoothTotal * 0.95 + (isProcessingState ? 0.55 : 0.0)) * pBoost;
        // Saturated theme-true tint across all 5 reactor themes (red, blue, purple, green, gold)
        const sparkBaseR = activeColor.r * 0.96 + 0.04;
        const sparkBaseG = activeColor.g * 0.96 + 0.04;
        const sparkBaseB = activeColor.b * 0.96 + 0.04;

        for (let i = 0; i < activeCount; i++) {
          const ix = i * 3;
          const iy = i * 3 + 1;
          const iz = i * 3 + 2;
          const phase = phases ? phases[i] : i * 1.1;
          const freq = freqs ? freqs[i] : 0.75;
          const vx = vels ? vels[ix] : 0.0;
          const vy = vels ? vels[iy] : 0.22;
          const vz = vels ? vels[iz] : 0.0;

          let px = positions[ix];
          let py = positions[iy];
          let pz = positions[iz];
          const rSq = px * px + py * py;
          const rDist = Math.sqrt(rSq) || 1.0;
          const invR = 1.0 / rDist;

          // Base thermal updraft & sinusoidal convection
          let dx = (vx + Math.sin(elapsedTime * 0.68 + phase) * 0.16) * speedMult;
          let dy = (vy + Math.cos(elapsedTime * 0.52 + phase) * 0.11) * speedMult;
          const dz = (vz + Math.sin(elapsedTime * 0.45 + phase * 0.7) * 0.05) * speedMult;

          // State & Voice Reactivity
          if (isListeningState) {
            // LISTENING: gentle centripetal pull toward outer reactor ring (r ~ 3.4) proportional to mic level
            const pullStrength = (0.35 + smoothTotal * 1.45) * (rDist > 3.2 ? 1.0 : -0.35);
            dx -= px * invR * pullStrength;
            dy -= py * invR * pullStrength;
          } else if (isProcessingState) {
            // PROCESSING: coherent vortex orbital swirl around reactor axis
            const swirlSpeed = 0.65 + smoothTotal * 0.6;
            dx += -py * invR * swirlSpeed;
            dy += px * invR * swirlSpeed;
          } else if (isSpeakingState) {
            // SPEAKING: outward acoustic bass wave push + rhythmic oscillation
            const acousticPush = (smoothBass * 1.65 + smoothMid * 0.75) * Math.max(0.25, Math.min(1.2, 6.5 * invR));
            dx += px * invR * acousticPush;
            dy += py * invR * acousticPush;
          } else if (isAlertState) {
            dx += Math.sin(elapsedTime * 14.0 + i) * 0.85;
            dy += Math.cos(elapsedTime * 14.0 + i * 1.3) * 0.85;
          }

          px += dx * delta;
          py += dy * delta;
          pz += dz * delta;

          // Uniform wrap across the full 16:9 camera frustum ([-14.6..+14.6] x [-8.4..+8.4])
          if (py > 8.45) {
            py = -8.35;
            px = (Math.random() - 0.5) * 28.8;
          } else if (py < -8.45) {
            py = 8.35;
          }
          if (px > 14.6) px = -14.5;
          else if (px < -14.6) px = 14.5;

          // Keep central A R C letters (r < 1.38) clean
          if (px * px + py * py < 1.92) {
            const ang = Math.atan2(py, px);
            px = Math.cos(ang) * 1.62;
            py = Math.sin(ang) * 1.62;
          }

          positions[ix] = px;
          positions[iy] = py;
          positions[iz] = pz;

          if (colors) {
            // Soft border wrap fade ONLY at the extreme outer 6% of viewport edges so widget zones stay rich
            const edgeX = Math.max(0.0, Math.min(1.0, (14.65 - Math.abs(px)) / 1.15));
            const edgeY = Math.max(0.0, Math.min(1.0, (8.48 - Math.abs(py)) / 0.85));
            const centerClearance = Math.max(0.0, Math.min(1.0, (rDist - 1.32) / 0.55));
            const envelope = edgeX * edgeY * centerClearance;

            // Individual smoldering HDR wave cresting above UnrealBloom threshold (>0.52)
            const wave = 0.5 + 0.5 * Math.sin(elapsedTime * freq + phase);
            const hdrCrest = wave > 0.55 ? 0.95 + (wave - 0.55) * 1.65 : 0.48 + wave * 0.85;
            const audioSpark = 1.0 + smoothTreble * 0.65 + smoothBass * 0.45 + smoothTotal * 0.35;
            const lum = hdrCrest * envelope * audioSpark * pBoost;

            colors[ix] = sparkBaseR * lum;
            colors[iy] = sparkBaseG * lum;
            colors[iz] = sparkBaseB * lum;
          }
        }
        posAttr.needsUpdate = true;
        if (colAttr) colAttr.needsUpdate = true;
        if (particles.sparksSystem.material instanceof THREE.PointsMaterial) {
          particles.sparksSystem.material.size = 0.44 + smoothBass * 0.10 + (isSpeakingState ? 0.05 : 0.0);
          particles.sparksSystem.material.opacity = Math.min(1.0, (0.88 + smoothTotal * 0.10) * stageRings);
        }

        // Update Tier 1: Foreground Soft Bokeh System (24 delicate micro-bokeh orbs, disabled in legacy budget stages 1-3)
        const bokehSystem = particles.sparksSystem.userData.bokehSystem as THREE.Points | undefined;
        if (bokehSystem) {
          const isBokehEnabled = pDensity > 0 && !diagFlags.useLegacyParticleBudget;
          bokehSystem.visible = isBokehEnabled;
          const bPosAttr = bokehSystem.geometry.attributes.position as THREE.BufferAttribute;
          const bColAttr = bokehSystem.geometry.attributes.color as THREE.BufferAttribute | undefined;
          const bPositions = bPosAttr.array as Float32Array;
          const bColors = bColAttr ? (bColAttr.array as Float32Array) : null;
          const bVels = bokehSystem.userData.velocities as Float32Array | undefined;
          const bPhases = bokehSystem.userData.phases as Float32Array | undefined;
          const bFreqs = bokehSystem.userData.freqs as Float32Array | undefined;
          const bActive = isBokehEnabled ? Math.max(0, Math.round(bPosAttr.count * pFraction)) : 0;
          bokehSystem.geometry.setDrawRange(0, bActive);

          const bokehR = activeColor.r * 0.98 + 0.02;
          const bokehG = activeColor.g * 0.98 + 0.02;
          const bokehB = activeColor.b * 0.98 + 0.02;

          for (let i = 0; i < bActive; i++) {
            const ix = i * 3;
            const iy = i * 3 + 1;
            const iz = i * 3 + 2;
            const phase = bPhases ? bPhases[i] : i * 1.4;
            const freq = bFreqs ? bFreqs[i] : 0.45;
            const vx = bVels ? bVels[ix] : 0.0;
            const vy = bVels ? bVels[iy] : 0.12;

            let bx = bPositions[ix] + (vx + Math.sin(elapsedTime * 0.42 + phase) * 0.12) * delta * speedMult;
            let by = bPositions[iy] + (vy + Math.cos(elapsedTime * 0.36 + phase) * 0.08) * delta * speedMult;
            const bz = bPositions[iz];

            const brDist = Math.sqrt(bx * bx + by * by) || 1.0;
            if (isListeningState) {
              bx -= (bx / brDist) * (0.22 + smoothTotal * 0.85) * delta;
              by -= (by / brDist) * (0.22 + smoothTotal * 0.85) * delta;
            } else if (isSpeakingState) {
              bx += (bx / brDist) * smoothBass * 0.95 * delta;
              by += (by / brDist) * smoothBass * 0.95 * delta;
            } else if (isProcessingState) {
              bx += (-by / brDist) * 0.42 * delta;
              by += (bx / brDist) * 0.42 * delta;
            }

            if (by > 8.4) {
              by = -8.3;
              bx = (Math.random() - 0.5) * 28.4;
            } else if (by < -8.4) {
              by = 8.3;
            }
            if (bx > 14.5) bx = -14.4;
            else if (bx < -14.5) bx = 14.4;

            if (bx * bx + by * by < 2.25) {
              const ang = Math.atan2(by, bx);
              bx = Math.cos(ang) * 1.75;
              by = Math.sin(ang) * 1.75;
            }

            bPositions[ix] = bx;
            bPositions[iy] = by;
            bPositions[iz] = bz;

            if (bColors) {
              const edgeX = Math.max(0.0, Math.min(1.0, (14.55 - Math.abs(bx)) / 1.25));
              const edgeY = Math.max(0.0, Math.min(1.0, (8.42 - Math.abs(by)) / 0.95));
              const centerClear = Math.max(0.0, Math.min(1.0, (brDist - 1.45) / 0.65));
              const breath = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(elapsedTime * freq + phase));
              const lum = breath * edgeX * edgeY * centerClear * (0.85 + smoothBass * 0.40 + smoothTotal * 0.20) * pBoost;

              bColors[ix] = bokehR * lum;
              bColors[iy] = bokehG * lum;
              bColors[iz] = bokehB * lum;
            }
          }
          bPosAttr.needsUpdate = true;
          if (bColAttr) bColAttr.needsUpdate = true;
          if (bokehSystem.material instanceof THREE.PointsMaterial) {
            bokehSystem.material.size = 0.78 + smoothBass * 0.18;
            bokehSystem.material.opacity = Math.min(0.58, (0.42 + smoothBass * 0.12) * stageRings);
          }
        }
      }
    }

    // 12.2 Tier 3: Cosmic Micro-Dust across the Full 16:9 Screen (dustParticles, 120 motes)
    if (particles.dustParticles) {
      particles.dustParticles.visible = pDensity > 0;
      if (pDensity <= 0) {
        particles.dustParticles.geometry.setDrawRange(0, 0);
      }
      if (pDensity > 0) {
        const posAttr = particles.dustParticles.geometry.attributes.position as THREE.BufferAttribute;
        const colAttr = particles.dustParticles.geometry.attributes.color as THREE.BufferAttribute | undefined;
        const positions = posAttr.array as Float32Array;
        const colors = colAttr ? (colAttr.array as Float32Array) : null;
        const phases = particles.dustParticles.userData.phases as Float32Array | undefined;
        const freqs = particles.dustParticles.userData.freqs as Float32Array | undefined;
        const totalDust = posAttr.count;
        const targetDustPool = diagFlags.useLegacyParticleBudget ? Math.min(totalDust, 64) : totalDust;
        const activeDust = Math.max(0, Math.round(targetDustPool * pFraction));
        particles.dustParticles.geometry.setDrawRange(0, activeDust);
        const driftVec = currentSignature.dustDriftVector;
        const pullSpeed = delta * (2.6 + smoothTotal * 2.2);

        const dustBaseR = activeColor.r * 0.94 + 0.06;
        const dustBaseG = activeColor.g * 0.94 + 0.06;
        const dustBaseB = activeColor.b * 0.94 + 0.06;

        for (let i = 0; i < activeDust; i++) {
          const ix = i * 3;
          const iy = i * 3 + 1;
          const iz = i * 3 + 2;
          const phase = phases ? phases[i] : i * 0.7;
          const freq = freqs ? freqs[i] : 0.5;

          let px = positions[ix];
          let py = positions[iy];
          let pz = positions[iz];
          const rDist = Math.sqrt(px * px + py * py) || 1.0;

          if (driftVec.pullTowardsCenter || isListeningState) {
            px -= px * pullSpeed * 0.10;
            py -= py * pullSpeed * 0.10;
            pz -= pz * pullSpeed * 0.06;
          } else if (isProcessingState) {
            px += (-py / rDist * 0.35 + Math.sin(elapsedTime * 0.5 + phase) * 0.12) * delta;
            py += (px / rDist * 0.35 + Math.cos(elapsedTime * 0.4 + phase) * 0.10) * delta;
          } else if (isSpeakingState) {
            const waveOut = 0.18 + smoothBass * 0.75 + smoothMid * 0.35;
            px += (px / rDist * waveOut + Math.sin(elapsedTime * 0.45 + phase) * 0.14) * delta;
            py += (py / rDist * waveOut + 0.10 + Math.cos(elapsedTime * 0.38 + phase) * 0.10) * delta;
          } else {
            // Calm weightless convection & slow drift across the full screen
            px += (Math.sin(elapsedTime * 0.40 + phase) * 0.15 - py * 0.012) * delta;
            py += (0.10 + Math.cos(elapsedTime * 0.34 + phase) * 0.11 + px * 0.012) * delta;
            pz += Math.sin(elapsedTime * 0.28 + phase * 1.3) * 0.05 * delta;
          }

          if (py > 8.5) {
            py = -8.4;
            px = (Math.random() - 0.5) * 29.0;
          } else if (py < -8.5) {
            py = 8.4;
          }
          if (px > 14.7) px = -14.6;
          else if (px < -14.7) px = 14.6;

          if (px * px + py * py < 1.92) {
            const ang = Math.random() * Math.PI * 2;
            px = Math.cos(ang) * (2.2 + Math.random() * 11.5);
            py = Math.sin(ang) * (1.8 + Math.random() * 6.2);
          }

          positions[ix] = px;
          positions[iy] = py;
          positions[iz] = pz;

          if (colors) {
            const edgeX = Math.max(0.0, Math.min(1.0, (14.75 - Math.abs(px)) / 1.1));
            const edgeY = Math.max(0.0, Math.min(1.0, (8.52 - Math.abs(py)) / 0.85));
            const centerClear = Math.max(0.0, Math.min(1.0, (rDist - 1.32) / 0.55));
            const shimmer = 0.48 + 0.52 * (0.5 + 0.5 * Math.sin(elapsedTime * freq + phase));
            const lum = shimmer * edgeX * edgeY * centerClear * (0.95 + smoothTreble * 0.45 + smoothTotal * 0.25) * pBoost;

            colors[ix] = dustBaseR * lum;
            colors[iy] = dustBaseG * lum;
            colors[iz] = dustBaseB * lum;
          }
        }
        posAttr.needsUpdate = true;
        if (colAttr) colAttr.needsUpdate = true;
        if (particles.dustParticles.material instanceof THREE.PointsMaterial) {
          particles.dustParticles.material.size = 0.26 + smoothTreble * 0.06;
          particles.dustParticles.material.opacity = Math.min(0.88, (0.72 + smoothTotal * 0.14) * stageRings);
        }
      }
    }

    if (particles.containmentLattice) {
      particles.containmentLattice.visible = false;
    }

    if (particles.dataNodes) {
      particles.dataNodes.visible = false;
    }

    // 13. Bloom Strength & Studio Accent Lighting (Phased by Stage — Controlled Optical Glow)
    const ramPulseMult = computeRamGlowPulse(ramUsage, elapsedTime);
    const clampedStrength = gfx ? Math.max(50, Math.min(150, gfx.bloomStrength)) : 92;
    const userBloomMult = 0.56 + ((clampedStrength - 50) / 100) * 0.38;
    let finalBloom =
      ((0.15 + currentVisuals.bloomStrength * 0.15) * (0.95 + (ramPulseMult - 1.0) * 0.10) + smoothTotal * 0.10 + manualPulseValue * 0.10) *
      masterGlow *
      userBloomMult;
    if (state === "speaking") {
      finalBloom *= 1.0 + 0.15 * smoothMid + 0.08 * smoothBass;
    }
    if (currentSignature.coreJitter > 0.2 && !prefersReducedMotion) {
      finalBloom *= (0.92 + Math.random() * 0.16);
    }
    finalBloom = Math.max(0.0, Math.min(0.34, finalBloom));
    postfx.bloomPass.strength += (finalBloom - postfx.bloomPass.strength) * 0.2;

    // Update dynamic lights per tier:
    // eco: coreLight only (soft) | standard: core + chamber + rim + restrained trench channel lights | full: full dynamic point lights
    const activeLightTier = gfx?.dynamicPointLights ?? "standard";
    const isEcoLights = activeLightTier === "eco";
    const isTrenchLightsEnabled = diagFlags.overrideActive
      ? diagFlags.enablePerimeterPointLights
      : !isEcoLights || diagFlags.enablePerimeterPointLights;

    lighting.coreLight.visible = true;
    lighting.coreLight.color.copy(activeColor);
    const targetCoreLight = isEcoLights
      ? Math.min(0.42, (0.26 + smoothTotal * 0.16) * stageCenter)
      : Math.min(0.76, (0.44 + smoothTotal * 0.30 + smoothBass * 0.14) * stageCenter);
    lighting.coreLight.intensity += (targetCoreLight - lighting.coreLight.intensity) * 0.2;

    if (coreSpillLight) {
      const spillEnabled = isGlowActive && !isEcoLights && gfx?.glslPlasmaShader !== false;
      if (!spillEnabled) {
        coreSpillLight.visible = false;
        coreSpillLight.intensity = 0.0;
      } else {
        coreSpillLight.visible = true;
        coreSpillLight.color.copy(activeColor).lerp(warmSpillTint, 0.20);
        const isCinematicSpill = activeLightTier === "full" || gfx?.pmremQuality === "high";
        const targetSpill = isCinematicSpill
          ? Math.min(1.90, (0.86 + currentVisuals.coreIntensity * 0.36 + smoothTotal * 0.34 + smoothBass * 0.22) * stageCenter)
          : Math.min(1.25, (0.56 + currentVisuals.coreIntensity * 0.26 + smoothTotal * 0.22 + smoothBass * 0.14) * stageCenter);
        coreSpillLight.intensity += (targetSpill - coreSpillLight.intensity) * 0.18;
      }
    }

    if (lighting.innerChamberLight.visible !== !isEcoLights) lighting.innerChamberLight.visible = !isEcoLights;
    if (lighting.rimLight.visible !== !isEcoLights) lighting.rimLight.visible = !isEcoLights;

    if (!isEcoLights) {
      lighting.rimLight.color.copy(activeColor);
      lighting.innerChamberLight.color.copy(activeColor);

      const targetChamberLight = Math.min(0.78, (0.46 + smoothMid * 0.30 + smoothBass * 0.14) * stageTrench);
      const targetRimLight = Math.min(0.68, (0.40 + smoothBass * 0.28) * stageRings);

      lighting.innerChamberLight.intensity += (targetChamberLight - lighting.innerChamberLight.intensity) * 0.2;
      lighting.rimLight.intensity += (targetRimLight - lighting.rimLight.intensity) * 0.2;
    }

    const trenchTierScale = activeLightTier === "full" ? 1.0 : 0.72;
    lighting.trenchLights.forEach((light) => {
      if (light.visible !== isTrenchLightsEnabled) light.visible = isTrenchLightsEnabled;
      if (isTrenchLightsEnabled) {
        light.color.copy(activeColor);
        const targetTrenchLight =
          (0.36 + smoothTotal * 0.32 + smoothBass * 0.24) * trenchTierScale * stageTrench;
        light.intensity += (targetTrenchLight - light.intensity) * 0.2;
      }
    });

    // 14. Telemetry 2 Hz periodic sample (audioEnvelope & effectiveGlow post-modulation)
    if (elapsedTime - lastTelemetry2HzTime >= 0.5) {
      lastTelemetry2HzTime = elapsedTime;
      const audioEnvelope = Number(smoothTotal.toFixed(3));
      const effectiveGlow = Number(materials.singularityCoreEmissiveMat.emissiveIntensity.toFixed(3));
      const audioContextState = (typeof window !== "undefined" && (window as any).audioManager?.getAudioContextState)
        ? (window as any).audioManager.getAudioContextState()
        : ((typeof window !== "undefined" && (window as any).sysAudioCtx?.state) || 'none');
      if (typeof window !== "undefined") {
        (window as any).__reactorLastTelemetry = {
          state,
          audioEnvelope,
          effectiveGlow,
          audioContextState,
          timestamp: elapsedTime,
        };
      }
    }

    // 14. Render with WebGL context safety check
    try {
      const gl = params.renderer?.getContext();
      if (gl && typeof gl.isContextLost === "function" && gl.isContextLost()) {
        return;
      }
      postfx.composer.render();
      lastFrameExecMs = lastFrameExecMs * 0.7 + (performance.now() - perfNow) * 0.3;
    } catch (err) {
      console.warn("[A.R.C. StateDriver] Render skipped due to WebGL context loss or error:", err);
    }
  };

  return {
    updateFrame,
    triggerPulse,
  };
}

