import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  countIpodScrollSparkShapes,
  createIpodScrollSparkState,
  IPOD_SCROLL_SPARK_CAPACITY,
  IPOD_SCROLL_SPARK_LIFETIME_SECONDS,
  stepIpodScrollSparks,
  type IpodScrollSparkSignals,
} from './ipodScrollSparks'

type IpodScrollSparkLayerProps = Readonly<{
  experienceSeed: number
  reducedMotion: boolean
  signals: IpodScrollSparkSignals
  leadingColor: string
  complementaryColor: string
  shadowColor: string
}>

const VERTEX_SHADER = /* glsl */ `
  precision highp float;

  attribute vec2 instanceCenter;
  attribute vec4 instanceMotion;
  attribute vec4 instanceStyle;

  uniform vec2 uResolution;
  uniform float uElapsedSeconds;

  varying vec2 vLocal;
  varying float vAge;
  varying float vShape;
  varying float vColor;

  void main() {
    float age = uElapsedSeconds - instanceStyle.x;
    float pop = smoothstep(0.0, 0.12, age);
    float exitProgress = smoothstep(0.65, 1.0, age);
    float scaleAmount = pop * mix(1.0, 0.2, exitProgress);
    float angle = instanceMotion.z + instanceMotion.w * age;
    float sine = sin(angle);
    float cosine = cos(angle);
    mat2 rotation = mat2(cosine, -sine, sine, cosine);
    vec2 local = rotation * position.xy;
    vec2 driftPixels = instanceMotion.xy * max(0.0, age);
    vec2 center = instanceCenter + driftPixels / uResolution;
    vec2 pixelOffset =
      local * instanceStyle.y * 0.5 * scaleAmount / uResolution;
    vec2 clipPosition = (center + pixelOffset) * 2.0 - 1.0;

    vLocal = position.xy;
    vAge = age;
    vShape = instanceStyle.z;
    vColor = instanceStyle.w;
    gl_Position = vec4(clipPosition, 0.999, 1.0);
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  #define PI 3.141592653589793
  #define LIFETIME ${IPOD_SCROLL_SPARK_LIFETIME_SECONDS.toFixed(1)}

  uniform vec3 uLeadingColor;
  uniform vec3 uComplementaryColor;
  uniform vec3 uShadowColor;

  varying vec2 vLocal;
  varying float vAge;
  varying float vShape;
  varying float vColor;

  void main() {
    if (vAge < 0.0 || vAge >= LIFETIME) {
      discard;
    }

    float radius = length(vLocal);
    float angle = atan(vLocal.y, vLocal.x);
    float starBoundary = mix(
      0.34,
      0.92,
      pow(max(0.0, 0.5 + 0.5 * cos(angle * 8.0)), 5.0)
    );
    float blobBoundary =
      0.66 + 0.17 * cos(angle * 4.0 + PI * 0.25);
    float boundary = mix(starBoundary, blobBoundary, step(0.5, vShape));
    float body = 1.0 - smoothstep(boundary - 0.055, boundary + 0.035, radius);
    float core = 1.0 - smoothstep(0.08, 0.42, radius);
    float halo =
      (1.0 - smoothstep(boundary + 0.025, boundary + 0.22, radius)) *
      (1.0 - body);
    float entrance = smoothstep(0.0, 0.12, vAge);
    float exit = 1.0 - smoothstep(0.65, LIFETIME, vAge);
    float envelope = entrance * exit;
    vec3 accent = mix(uLeadingColor, uComplementaryColor, step(0.5, vColor));
    vec3 bodyColor = mix(accent, vec3(1.0), 0.25 + core * 0.38);
    vec3 finalColor = mix(uShadowColor, bodyColor, body);
    float alpha = (body * 0.96 + halo * 0.28) * envelope;

    gl_FragColor = vec4(finalColor, alpha);
    #include <colorspace_fragment>
  }
`

export function IpodScrollSparkLayer({
  experienceSeed,
  reducedMotion,
  signals,
  leadingColor,
  complementaryColor,
  shadowColor,
}: IpodScrollSparkLayerProps) {
  const size = useThree((state) => state.size)
  const canvasElement = useThree((state) => state.gl.domElement)
  const diagnosticsFrameRef = useRef(0)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const animationState = useMemo(
    createIpodScrollSparkState,
    [experienceSeed],
  )
  const geometry = useMemo(() => {
    const nextGeometry = new THREE.InstancedBufferGeometry()
    nextGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -1, -1, 0,
          1, -1, 0,
          1, 1, 0,
          -1, 1, 0,
        ],
        3,
      ),
    )
    nextGeometry.setIndex([0, 1, 2, 0, 2, 3])
    nextGeometry.setAttribute(
      'instanceCenter',
      new THREE.InstancedBufferAttribute(animationState.centers, 2),
    )
    nextGeometry.setAttribute(
      'instanceMotion',
      new THREE.InstancedBufferAttribute(animationState.motion, 4),
    )
    nextGeometry.setAttribute(
      'instanceStyle',
      new THREE.InstancedBufferAttribute(animationState.style, 4),
    )
    nextGeometry.instanceCount = IPOD_SCROLL_SPARK_CAPACITY
    return nextGeometry
  }, [animationState])
  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uElapsedSeconds: { value: 0 },
      uLeadingColor: { value: new THREE.Color(leadingColor) },
      uComplementaryColor: {
        value: new THREE.Color(complementaryColor),
      },
      uShadowColor: { value: new THREE.Color(shadowColor) },
    }),
    [complementaryColor, leadingColor, shadowColor],
  )

  useEffect(() => {
    uniforms.uResolution.value.set(size.width, size.height)
    const materialResolution =
      materialRef.current?.uniforms.uResolution.value as
        | THREE.Vector2
        | undefined
    materialResolution?.set(size.width, size.height)
  }, [size.height, size.width, uniforms])

  useEffect(
    () => () => {
      geometry.dispose()
      delete canvasElement.dataset.ipodScrollSparkDiagnostics
    },
    [canvasElement, geometry],
  )

  useFrame((_, delta) => {
    const previousActiveCount = animationState.activeCount
    const spawnedCount = stepIpodScrollSparks(
      animationState,
      signals,
      experienceSeed,
      size.width,
      size.height,
      delta,
      reducedMotion,
    )
    uniforms.uElapsedSeconds.value = animationState.elapsedSeconds
    if (materialRef.current) {
      materialRef.current.uniforms.uElapsedSeconds.value =
        animationState.elapsedSeconds
    }
    if (
      spawnedCount > 0 ||
      (reducedMotion && previousActiveCount > 0)
    ) {
      geometry.getAttribute('instanceCenter').needsUpdate = true
      geometry.getAttribute('instanceMotion').needsUpdate = true
      geometry.getAttribute('instanceStyle').needsUpdate = true
    }

    if (import.meta.env.DEV) {
      diagnosticsFrameRef.current += 1
      if (diagnosticsFrameRef.current % 10 === 0) {
        const shapeCounts = countIpodScrollSparkShapes(animationState)
        canvasElement.dataset.ipodScrollSparkDiagnostics =
          JSON.stringify({
            activeCount: animationState.activeCount,
            emittedCount: animationState.emittedCount,
            recycledCount: animationState.recycledCount,
            stars: shapeCounts.stars,
            blobs: shapeCounts.blobs,
            observedSequence: animationState.observedSequence,
          })
      }
    }
  })

  return (
    <mesh
      frustumCulled={false}
      geometry={geometry}
      renderOrder={-999}
    >
      <shaderMaterial
        ref={materialRef}
        blending={THREE.NormalBlending}
        depthTest
        depthWrite={false}
        fragmentShader={FRAGMENT_SHADER}
        side={THREE.DoubleSide}
        toneMapped={false}
        transparent
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
      />
    </mesh>
  )
}
