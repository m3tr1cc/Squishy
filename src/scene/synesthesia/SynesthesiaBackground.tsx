import { ScreenQuad } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  createSynesthesiaAnimationState,
  SYNESTHESIA_MOTIF_SLOT_COUNT,
  type SquishyVisualSignals,
  type SynesthesiaTheme,
  stepSynesthesiaAnimation,
} from './synesthesiaAnimation'

type SynesthesiaBackgroundProps = Readonly<{
  reducedMotion: boolean
  signals: SquishyVisualSignals
  theme: SynesthesiaTheme
}>

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  #define PI 3.141592653589793
  #define TAU 6.283185307179586
  #define MOTIF_COUNT ${SYNESTHESIA_MOTIF_SLOT_COUNT}

  uniform vec2 uResolution;
  uniform vec3 uLeadingColor;
  uniform vec3 uComplementaryColor;
  uniform vec3 uShadowColor;
  uniform float uElapsedSeconds;
  uniform float uFlowTime;
  uniform float uFlowSpeed;
  uniform float uBurstEnergy;
  uniform float uDamageProgress;
  uniform vec4 uMotifData[MOTIF_COUNT];

  varying vec2 vUv;

  float hash11(float value) {
    return fract(sin(value * 127.1) * 43758.5453123);
  }

  vec2 hash21(float value) {
    return fract(
      sin(vec2(value * 127.1, value * 311.7)) *
      vec2(43758.5453, 22578.1459)
    );
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 fraction = fract(point);
    fraction = fraction * fraction * (3.0 - 2.0 * fraction);

    float a = hash11(dot(cell, vec2(1.0, 57.0)));
    float b = hash11(dot(cell + vec2(1.0, 0.0), vec2(1.0, 57.0)));
    float c = hash11(dot(cell + vec2(0.0, 1.0), vec2(1.0, 57.0)));
    float d = hash11(dot(cell + vec2(1.0), vec2(1.0, 57.0)));

    return mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
  }

  float lowFrequencyNoise(vec2 point) {
    float value = valueNoise(point) * 0.68;
    value += valueNoise(point * 2.03 + 7.7) * 0.32;
    return value;
  }

  mat2 rotation(float angle) {
    float sine = sin(angle);
    float cosine = cos(angle);
    return mat2(cosine, -sine, sine, cosine);
  }

  float softEllipse(
    vec2 point,
    vec2 center,
    vec2 radii,
    float softness
  ) {
    float distanceFromCenter = length((point - center) / radii);
    return 1.0 - smoothstep(1.0 - softness, 1.0, distanceFromCenter);
  }

  float spiralMotif(vec2 point, float phase, float growth) {
    float radius = length(point);
    float angle = atan(point.y, point.x);
    float spiralDistance = abs(
      fract(
        angle / TAU -
        radius * 1.55 +
        phase / TAU +
        0.5
      ) - 0.5
    );
    float line = 1.0 - smoothstep(0.025, 0.075, spiralDistance);
    float radialWindow =
      smoothstep(0.05, 0.2, radius) *
      (1.0 - smoothstep(0.55 * growth, 0.72 * growth, radius));
    return line * radialWindow;
  }

  float ribbonMotif(vec2 point, float phase, float growth) {
    float width = mix(0.21, 0.1, growth);
    float centerLine =
      0.2 * sin(point.x * 4.0 + phase) +
      0.07 * point.x * point.x * sign(sin(phase));
    float band = abs(point.y - centerLine);
    float body =
      smoothstep(width, width - 0.035, band) *
      smoothstep(-0.9, -0.55, point.x) *
      (1.0 - smoothstep(0.55, 1.05, point.x));
    float hollow = smoothstep(
      width * 0.28,
      width * 0.55,
      band
    );
    return body * mix(1.0, hollow, 0.38);
  }

  float contourMotif(vec2 point, float phase, float growth) {
    point.y += sin(point.x * 2.5 + phase) * 0.12;
    float contour =
      abs(sin((length(point * vec2(0.8, 1.3)) * 9.0) - phase));
    float line = 1.0 - smoothstep(0.03, 0.17, contour);
    float window =
      smoothstep(0.04, 0.16, length(point)) *
      (1.0 - smoothstep(0.55 * growth, 0.8 * growth, length(point)));
    return line * window;
  }

  void main() {
    float aspect = uResolution.x / max(1.0, uResolution.y);
    vec2 point = (vUv - 0.5) * vec2(aspect, 1.0);
    float flow = uFlowTime;

    vec2 warp = vec2(
      lowFrequencyNoise(point * 1.15 + vec2(flow * 0.8, -flow * 0.35)),
      lowFrequencyNoise(point * 1.12 + vec2(-flow * 0.42, flow * 0.68) + 9.4)
    ) - 0.5;
    vec2 fieldPoint = point + warp * (0.34 + uDamageProgress * 0.08);

    float colorField = lowFrequencyNoise(
      fieldPoint * 1.55 + vec2(flow * 0.38, -flow * 0.26)
    );
    colorField +=
      sin(fieldPoint.x * 2.2 - fieldPoint.y * 1.5 + flow * 0.7) * 0.12;
    colorField = smoothstep(0.25, 0.76, colorField);

    vec3 deepLeading = mix(uShadowColor, uLeadingColor, 0.42);
    vec3 deepComplement = mix(
      uShadowColor,
      uComplementaryColor,
      0.48
    );
    vec3 color = mix(deepComplement, deepLeading, colorField);

    float leadingBlob = softEllipse(
      fieldPoint,
      vec2(
        sin(flow * 0.51) * aspect * 0.28,
        cos(flow * 0.38) * 0.24
      ),
      vec2(aspect * 0.52, 0.46),
      0.55
    );
    float complementaryBlob = softEllipse(
      fieldPoint,
      vec2(
        cos(flow * 0.34 + 1.8) * aspect * 0.4,
        sin(flow * 0.46 + 0.5) * 0.34
      ),
      vec2(aspect * 0.4, 0.38),
      0.62
    );
    color = mix(color, uLeadingColor, leadingBlob * 0.28);
    color = mix(
      color,
      uComplementaryColor,
      complementaryBlob * 0.34
    );

    float darkPocket = smoothstep(
      0.54,
      0.82,
      lowFrequencyNoise(
        fieldPoint * 1.28 + vec2(-flow * 0.24, flow * 0.21) + 16.0
      )
    );
    color = mix(color, uShadowColor, darkPocket * 0.74);

    float centerVignette = 1.0 - smoothstep(
      0.16,
      0.78,
      length(point / vec2(max(1.0, aspect * 0.88), 0.82))
    );
    color = mix(color, uShadowColor, centerVignette * 0.34);

    float ambientContour = 1.0 - smoothstep(
      0.015,
      0.09,
      abs(sin(
        length(fieldPoint * vec2(0.68, 1.15)) * 15.0 -
        atan(fieldPoint.y, fieldPoint.x) * 1.4 +
        flow
      ))
    );
    ambientContour *=
      uDamageProgress *
      (0.08 + uDamageProgress * 0.12) *
      (1.0 - centerVignette * 0.55);
    color = mix(
      color,
      mix(uLeadingColor, uComplementaryColor, 0.5),
      ambientContour
    );

    float burstEnvelope = smoothstep(0.015, 0.2, uBurstEnergy);
    float burstPhase = uElapsedSeconds * 2.1;
    color = mix(
      color,
      uShadowColor,
      burstEnvelope * (0.2 + darkPocket * 0.2)
    );
    float burstSpiral = spiralMotif(
      rotation(-0.3) * (
        point - vec2(-aspect * 0.46, 0.12)
      ) / 1.18,
      burstPhase,
      1.28
    );
    float burstRibbon = ribbonMotif(
      rotation(0.08) * (
        point - vec2(0.0, 0.48)
      ) / vec2(1.55, 0.88),
      burstPhase * 0.68,
      1.15
    );
    float burstContour = contourMotif(
      rotation(0.45) * (
        point - vec2(aspect * 0.43, -0.38)
      ) / 1.12,
      burstPhase * 0.84,
      1.22
    );
    color = mix(
      color,
      mix(uComplementaryColor, vec3(1.0), 0.14),
      burstSpiral * burstEnvelope * 0.82
    );
    color = mix(
      color,
      mix(uLeadingColor, vec3(1.0), 0.18),
      burstRibbon * burstEnvelope * 0.78
    );
    color = mix(
      color,
      mix(uComplementaryColor, uLeadingColor, 0.42),
      burstContour * burstEnvelope * 0.72
    );

    for (int index = 0; index < MOTIF_COUNT; index += 1) {
      vec4 motif = uMotifData[index];
      float age = uElapsedSeconds - motif.y;
      float activeAmount =
        step(0.0001, motif.z) *
        step(0.0, age) *
        (1.0 - step(3.2, age));
      float entrance = smoothstep(0.0, 0.2, age);
      float exit = 1.0 - smoothstep(2.35, 3.2, age);
      float envelope =
        activeAmount *
        entrance *
        exit *
        (0.55 + motif.z * 0.45);
      float growth = 0.55 + smoothstep(0.0, 1.15, age) * 0.72;

      vec2 randomPair = hash21(motif.x * 913.7 + 2.3);
      float edge = mod(
        floor(randomPair.x * 4.0) + float(index),
        4.0
      );
      vec2 center = vec2(0.0);
      if (edge < 1.0) {
        center = vec2(-aspect * 0.48, mix(-0.34, 0.34, randomPair.y));
      } else if (edge < 2.0) {
        center = vec2(aspect * 0.48, mix(-0.34, 0.34, randomPair.y));
      } else if (edge < 3.0) {
        center = vec2(mix(-aspect * 0.38, aspect * 0.38, randomPair.y), 0.45);
      } else {
        center = vec2(mix(-aspect * 0.38, aspect * 0.38, randomPair.y), -0.45);
      }
      float angle = hash11(motif.x * 237.4 + 1.7) * TAU;
      float scale = mix(0.68, 1.05, hash11(motif.x * 531.9));
      vec2 motifPoint = rotation(angle) * (point - center) / scale;
      motifPoint.x -=
        (age - 0.45) *
        mix(-0.12, 0.12, hash11(motif.x * 117.0));

      float shape = 0.0;
      if (motif.w < 0.5) {
        shape = spiralMotif(
          motifPoint,
          age * 2.3 + motif.x * TAU,
          growth
        );
      } else if (motif.w < 1.5) {
        shape = ribbonMotif(
          motifPoint,
          age * 1.4 + motif.x * TAU,
          growth
        );
      } else {
        shape = contourMotif(
          motifPoint,
          age * 1.8 + motif.x * TAU,
          growth
        );
      }

      vec3 motifColor = mix(
        mix(uLeadingColor, vec3(1.0), 0.18),
        mix(uComplementaryColor, vec3(1.0), 0.14),
        step(0.5, hash11(motif.x * 771.0))
      );
      float halo =
        (1.0 - smoothstep(0.18, 0.82, length(motifPoint))) *
        envelope;
      color = mix(color, motifColor, halo * 0.24);
      color = mix(
        color,
        motifColor,
        shape * envelope * (0.36 + uBurstEnergy * 0.16)
      );
    }

    float edgeVignette = smoothstep(
      0.42,
      1.06,
      length(point / vec2(max(1.0, aspect), 1.0))
    );
    color = mix(color, uShadowColor, edgeVignette * 0.28);
    color *= 0.88 + min(0.12, (uFlowSpeed - 1.0) * 0.035);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

export function SynesthesiaBackground({
  reducedMotion,
  signals,
  theme,
}: SynesthesiaBackgroundProps) {
  const size = useThree((state) => state.size)
  const canvasElement = useThree((state) => state.gl.domElement)
  const diagnosticsFrameRef = useRef(0)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const animationState = useMemo(
    createSynesthesiaAnimationState,
    [theme],
  )
  const motifUniforms = useMemo(
    () =>
      Array.from(
        { length: SYNESTHESIA_MOTIF_SLOT_COUNT },
        () => new THREE.Vector4(),
      ),
    [],
  )
  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uLeadingColor: {
        value: new THREE.Color(theme.leadingColor),
      },
      uComplementaryColor: {
        value: new THREE.Color(theme.complementaryColor),
      },
      uShadowColor: {
        value: new THREE.Color(theme.shadowColor),
      },
      uElapsedSeconds: { value: 0 },
      uFlowTime: { value: 0 },
      uFlowSpeed: { value: 1 },
      uBurstEnergy: { value: 0 },
      uDamageProgress: { value: 0 },
      uMotifData: { value: motifUniforms },
    }),
    [motifUniforms, theme],
  )

  useEffect(() => {
    uniforms.uResolution.value.set(size.width, size.height)
  }, [size.height, size.width, uniforms])

  useEffect(
    () => () => {
      delete canvasElement.dataset.synesthesiaDiagnostics
    },
    [canvasElement],
  )

  useFrame((_, delta) => {
    stepSynesthesiaAnimation(
      animationState,
      signals,
      theme,
      delta,
      reducedMotion,
    )
    uniforms.uElapsedSeconds.value = animationState.elapsedSeconds
    uniforms.uFlowTime.value = animationState.flowTime
    uniforms.uFlowSpeed.value = animationState.flowSpeed
    uniforms.uBurstEnergy.value = animationState.burstEnergy
    uniforms.uDamageProgress.value = animationState.damageProgress
    const materialUniforms = materialRef.current?.uniforms
    if (materialUniforms) {
      materialUniforms.uElapsedSeconds.value =
        animationState.elapsedSeconds
      materialUniforms.uFlowTime.value = animationState.flowTime
      materialUniforms.uFlowSpeed.value = animationState.flowSpeed
      materialUniforms.uBurstEnergy.value =
        animationState.burstEnergy
      materialUniforms.uDamageProgress.value =
        animationState.damageProgress
    }
    for (
      let slot = 0;
      slot < SYNESTHESIA_MOTIF_SLOT_COUNT;
      slot += 1
    ) {
      const offset = slot * 4
      motifUniforms[slot].set(
        animationState.motifData[offset],
        animationState.motifData[offset + 1],
        animationState.motifData[offset + 2],
        animationState.motifData[offset + 3],
      )
    }
    const materialMotifs = materialUniforms?.uMotifData
      .value as THREE.Vector4[] | undefined
    if (materialMotifs && materialMotifs !== motifUniforms) {
      for (
        let slot = 0;
        slot < SYNESTHESIA_MOTIF_SLOT_COUNT;
        slot += 1
      ) {
        materialMotifs[slot].copy(motifUniforms[slot])
      }
    }
    if (materialRef.current) {
      materialRef.current.uniformsNeedUpdate = true
    }
    if (import.meta.env.DEV) {
      diagnosticsFrameRef.current += 1
      if (diagnosticsFrameRef.current % 30 === 0) {
        let activeMotifs = 0
        for (
          let offset = 2;
          offset < animationState.motifData.length;
          offset += 4
        ) {
          if (animationState.motifData[offset] > 0) {
            activeMotifs += 1
          }
        }
        canvasElement.dataset.synesthesiaDiagnostics =
          JSON.stringify({
            activeMotifs,
            burstEnergy: animationState.burstEnergy,
            damageProgress: animationState.damageProgress,
            flowSpeed: animationState.flowSpeed,
          })
      }
    }
  })

  return (
    <ScreenQuad renderOrder={-1000}>
      <shaderMaterial
        ref={materialRef}
        depthTest
        depthWrite={false}
        fragmentShader={FRAGMENT_SHADER}
        toneMapped={false}
        transparent
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
      />
    </ScreenQuad>
  )
}
