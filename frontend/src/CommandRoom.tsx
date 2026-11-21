import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { buildLandPoints, latLonToXYZ } from './landData'

const R = 2

function radialTexture(stops: Array<[number, string]>) {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  stops.forEach(([o, col]) => g.addColorStop(o, col))
  x.fillStyle = g
  x.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

const OCEAN_VERT = `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`

const OCEAN_FRAG = `
uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.4);
  vec3 col = mix(vec3(0.004,0.03,0.07), vec3(0.01,0.09,0.17), vUv.y);
  float lx = abs(fract(vUv.x * 36.0) - 0.5);
  float ly = abs(fract(vUv.y * 18.0) - 0.5);
  col += smoothstep(0.47, 0.5, max(lx, ly)) * 0.5 * vec3(0.05, 0.4, 0.55);
  col += smoothstep(0.02, 0.0, abs(vUv.y - fract(uTime * 0.07))) * vec3(0.2, 0.9, 1.0) * 0.5;
  col += f * vec3(0.1, 0.8, 0.9) * 1.1;
  gl_FragColor = vec4(col, 1.0);
}`

const ATMO_VERT = `
varying vec3 vN;
void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

const ATMO_FRAG = `
varying vec3 vN;
void main(){
  float i = pow(max(0.0, 0.78 - dot(vN, vec3(0.0, 0.0, 1.0))), 2.6);
  gl_FragColor = vec4(vec3(0.2, 0.85, 1.0) * i * 1.9, i);
}`

// Illustrative marker positions. The API does not return coordinates, so these are not real event locations.
const MARKERS: Array<{ lat: number; lon: number; color: string }> = [
  { lat: 40, lon: -100, color: '#19e6c1' },
  { lat: 50, lon: 12, color: '#19e6c1' },
  { lat: 30, lon: 95, color: '#ff4d6d' },
  { lat: -15, lon: -60, color: '#ffb84d' },
  { lat: -25, lon: 135, color: '#19e6c1' },
]

function Globe() {
  const float = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const sat = useRef<THREE.Group>(null)
  const sat2 = useRef<THREE.Group>(null)

  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])
  const land = useMemo(() => {
    const { positions, colors } = buildLandPoints(R * 1.004)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return g
  }, [])
  const glowTex = useMemo(
    () => radialTexture([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]),
    [],
  )
  const dotMat = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.06,
        vertexColors: true,
      }),
    [],
  )
  const oceanMat = useMemo(
    () => new THREE.ShaderMaterial({ uniforms, vertexShader: OCEAN_VERT, fragmentShader: OCEAN_FRAG }),
    [uniforms],
  )
  const atmoMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  )

  useFrame((state, delta) => {
    uniforms.uTime.value = state.clock.elapsedTime
    if (spin.current) spin.current.rotation.y += delta * 0.1
    if (float.current) float.current.position.y = 1.15 + Math.sin(state.clock.elapsedTime * 0.7) * 0.05
    if (sat.current) sat.current.rotation.z += delta * 0.45
    if (sat2.current) sat2.current.rotation.z -= delta * 0.3
  })

  return (
    <group ref={float} position={[0, 1.15, 0]}>
      <group ref={spin}>
        <mesh material={oceanMat}>
          <sphereGeometry args={[R * 0.985, 64, 48]} />
        </mesh>
        <points geometry={land} material={dotMat} />
        {MARKERS.map((m, i) => {
          const p = latLonToXYZ(m.lat, m.lon, R * 1.01)
          return (
            <group key={i} position={p}>
              <mesh>
                <sphereGeometry args={[0.045, 16, 16]} />
                <meshBasicMaterial color={m.color} />
              </mesh>
              <sprite scale={[0.42, 0.42, 1]}>
                <spriteMaterial map={glowTex} color={m.color} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
              </sprite>
            </group>
          )
        })}
      </group>

      <mesh material={atmoMat}>
        <sphereGeometry args={[R * 1.16, 64, 48]} />
      </mesh>

      {/* Orbit rings with traveling nodes */}
      <group rotation={[0.55, 0.2, 0.3]}>
        <mesh>
          <torusGeometry args={[R * 1.32, 0.012, 8, 220]} />
          <meshBasicMaterial color="#b46cff" />
        </mesh>
        <group ref={sat}>
          <mesh position={[R * 1.32, 0, 0]}>
            <sphereGeometry args={[0.07, 16, 16]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <sprite position={[R * 1.32, 0, 0]} scale={[0.5, 0.5, 1]}>
            <spriteMaterial map={glowTex} color="#b46cff" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        </group>
      </group>
      <group rotation={[1.2, -0.3, 0.1]}>
        <mesh>
          <torusGeometry args={[R * 1.5, 0.008, 8, 220]} />
          <meshBasicMaterial color="#2fd8ff" transparent opacity={0.7} />
        </mesh>
        <group ref={sat2}>
          <mesh position={[R * 1.5, 0, 0]}>
            <sphereGeometry args={[0.05, 16, 16]} />
            <meshBasicMaterial color="#aef6ff" />
          </mesh>
        </group>
      </group>
    </group>
  )
}

function Platform() {
  const glow = useMemo(
    () => radialTexture([[0, 'rgba(60,200,255,0.9)'], [0.5, 'rgba(60,120,255,0.25)'], [1, 'rgba(60,120,255,0)']]),
    [],
  )
  const ringA = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (ringA.current) {
      const m = ringA.current.material as THREE.MeshBasicMaterial
      m.opacity = 0.75 + Math.sin(state.clock.elapsedTime * 2) * 0.25
    }
  })

  return (
    <group position={[0, -2.05, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]}>
        <circleGeometry args={[5.2, 64]} />
        <meshBasicMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[3.0, 3.35, 0.36, 72]} />
        <meshStandardMaterial color="#0d2244" emissive="#0a3a7a" emissiveIntensity={0.7} metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[2.5, 2.9, 0.1, 72]} />
        <meshStandardMaterial color="#10305a" emissive="#0e5a9a" emissiveIntensity={0.6} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh ref={ringA} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
        <torusGeometry args={[2.95, 0.045, 12, 140]} />
        <meshBasicMaterial color="#2fd8ff" transparent />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.17, 0]}>
        <torusGeometry args={[3.5, 0.02, 8, 140]} />
        <meshBasicMaterial color="#9a5bff" transparent opacity={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.25, 0]}>
        <torusGeometry args={[2.1, 0.03, 10, 120]} />
        <meshBasicMaterial color="#b46cff" />
      </mesh>
      {/* Light column between platform and globe */}
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[1.0, 1.9, 1.5, 48, 1, true]} />
        <meshBasicMaterial color="#2fd8ff" transparent opacity={0.07} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

export default function CommandRoom() {
  return (
    <div className="command-room-canvas">
      <Canvas camera={{ position: [0, 0.8, 10.8], fov: 38 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[0, 4, 4]} intensity={40} color="#3be9e4" />
        <pointLight position={[-5, 1, 2]} intensity={30} color="#9a5bff" />
        <Stars radius={45} depth={30} count={700} factor={2} fade speed={0.2} />
        <Globe />
        <Platform />
        <OrbitControls
          target={[0, 0.35, 0]}
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI * 0.36}
          maxPolarAngle={Math.PI * 0.6}
          minAzimuthAngle={-0.4}
          maxAzimuthAngle={0.4}
        />
      </Canvas>
    </div>
  )
}
