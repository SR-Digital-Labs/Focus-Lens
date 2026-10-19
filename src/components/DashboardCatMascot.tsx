import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Group, Mesh } from 'three';

const CHAT_MESSAGES = [
  'Hiii! 🐱💕',
  'Hello there!',
  'How are you?',
  'See you soon!',
];

interface CatModelProps {
  reducedMotion: boolean;
  message: string | null;
  approachStarted: { current: number | null };
  onHover: () => void;
  onClick: () => void;
}

const X_FRACTIONS = [0.1, 0.9, 0.9, 0.1, 0.1, 0.9];
const Y_FRACTIONS = [0.23, 0.23, 0.52, 0.52, 0.81, 0.81];

function CatModel({
  reducedMotion,
  message,
  approachStarted,
  onHover,
  onClick,
}: CatModelProps) {
  const bodyRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const tailRef = useRef<Group>(null);
  const leftEarRef = useRef<Group>(null);
  const rightEarRef = useRef<Group>(null);
  const leftEyeRef = useRef<Mesh>(null);
  const rightEyeRef = useRef<Mesh>(null);
  const legsRef = useRef<Array<Group | null>>([]);
  const rootRef = useRef<Group>(null);
  const { size, viewport } = useThree();
  const layoutRef = useRef({ left: 0, right: size.width });
  const nextLayoutMeasureRef = useRef(0);

  useFrame(({ clock }) => {
    const root = rootRef.current;
    const body = bodyRef.current;
    const head = headRef.current;
    const tail = tailRef.current;
    if (!root || !body || !head || !tail) return;

    const elapsed = clock.getElapsedTime();
    if (elapsed >= nextLayoutMeasureRef.current) {
      const app = document.querySelector('.main-content')?.getBoundingClientRect();
      layoutRef.current = {
        left: app?.left ?? 0,
        right: app?.right ?? size.width,
      };
      nextLayoutMeasureRef.current = elapsed + 0.5;
    }
    const { left, right } = layoutRef.current;
    const horizontalRoom = Math.max(0, right - left - 150);
    const routeElapsed = Math.max(0, elapsed - 2.4);
    const segment = Math.floor(routeElapsed / 5.8) % X_FRACTIONS.length;
    const progress = (routeElapsed % 5.8) / 5.8;
    const eased = progress * progress * (3 - 2 * progress);
    const next = (segment + 1) % X_FRACTIONS.length;
    const xFraction = X_FRACTIONS[segment] + (X_FRACTIONS[next] - X_FRACTIONS[segment]) * eased;
    const yFraction = Y_FRACTIONS[segment] + (Y_FRACTIONS[next] - Y_FRACTIONS[segment]) * eased;
    const screenX = left + 75 + horizontalRoom * xFraction;
    const screenY = size.height * yFraction;
    let x = ((screenX / size.width) - 0.5) * viewport.width;
    let y = (0.5 - screenY / size.height) * viewport.height;
    let direction = X_FRACTIONS[next] >= X_FRACTIONS[segment] ? 1 : -1;

    if (!reducedMotion) {
      const approachStartedAt = approachStarted.current;
      const approachTime = approachStartedAt === null
        ? Number.POSITIVE_INFINITY
        : performance.now() / 1_000 - approachStartedAt;
      const isApproaching = approachStartedAt !== null && approachTime < 2.9;
      if (approachStartedAt !== null) {
        const approachProgress = Math.min(1, Math.max(0, approachTime / 0.8));
        const approachEase = approachProgress * approachProgress * (3 - 2 * approachProgress);
        const targetX = ((left + (right - left) * 0.52) / size.width - 0.5) * viewport.width;
        const targetY = (0.5 - 0.54) * viewport.height;
        if (approachTime < 0.8) {
          const startX = x;
          x += (targetX - x) * approachEase;
          y += (targetY - y) * approachEase;
          direction = targetX >= startX ? 1 : -1;
        } else if (approachTime < 2.1) {
          x = targetX;
          y = targetY;
        } else if (approachTime < 2.9) {
          const returnProgress = (approachTime - 2.1) / 0.8;
          const returnEase = returnProgress * returnProgress * (3 - 2 * returnProgress);
          x = targetX + (x - targetX) * returnEase;
          y = targetY + (y - targetY) * returnEase;
        }
      }

      const walking = Math.abs(X_FRACTIONS[next] - X_FRACTIONS[segment]) > 0.01
        || Math.abs(Y_FRACTIONS[next] - Y_FRACTIONS[segment]) > 0.01;
      const sitPhase = elapsed % 23;
      const sitting = sitPhase > 18.5 && sitPhase < 21.5 && !isApproaching;
      const gait = elapsed * 8.5;
      const bob = walking && !sitting ? Math.abs(Math.sin(gait)) * 0.075 : Math.sin(elapsed * 2.1) * 0.018;
      const sitBlend = sitting ? Math.sin(((sitPhase - 18.5) / 3) * Math.PI) : 0;
      const responsiveScale = Math.min(1, size.width / 850);

      root.position.set(x, y + bob - sitBlend * 0.12, 0);
      root.scale.set(direction * 0.94 * responsiveScale, 0.94 * responsiveScale, 0.94 * responsiveScale);
      root.rotation.z = Math.sin(elapsed * 1.4) * 0.025 + sitBlend * 0.08;
      body.rotation.z = Math.sin(gait) * 0.025 + sitBlend * 0.2;
      head.rotation.y = Math.sin(elapsed * 0.9) * 0.13;
      head.rotation.z = Math.sin(elapsed * 1.3) * 0.035;
      tail.rotation.x = Math.sin(elapsed * 2.1) * 0.24;
      tail.rotation.z = Math.sin(elapsed * 1.7) * 0.22;
      if (leftEarRef.current) leftEarRef.current.rotation.z = Math.sin(elapsed * 3.2) * 0.08;
      if (rightEarRef.current) rightEarRef.current.rotation.z = -Math.sin(elapsed * 2.8 + 0.8) * 0.08;

      legsRef.current.forEach((leg, index) => {
        if (!leg) return;
        const phase = index === 0 || index === 3 ? 0 : Math.PI;
        leg.rotation.z = sitting ? (index < 2 ? -0.2 : 0.55) : Math.sin(gait + phase) * 0.38;
      });

      const blinkPhase = elapsed % 4.7;
      const blink = blinkPhase < 0.18 ? Math.sin((blinkPhase / 0.18) * Math.PI) : 0;
      if (leftEyeRef.current) leftEyeRef.current.scale.y = 1 - blink * 0.9;
      if (rightEyeRef.current) rightEyeRef.current.scale.y = 1 - blink * 0.9;
    } else {
      root.position.set(((left + right) / 2 / size.width - 0.5) * viewport.width, 0, 0);
      root.scale.set(0.82, 0.82, 0.82);
    }
  });

  return (
    <group ref={rootRef}>
      <group ref={bodyRef}>
        <mesh position={[-0.12, 0.73, 0]} scale={[0.81, 0.53, 0.51]} castShadow>
          <sphereGeometry args={[1, 32, 24]} />
          <meshStandardMaterial color="#e9a969" roughness={0.82} />
        </mesh>
        <mesh position={[0.35, 0.72, 0.06]} scale={[0.34, 0.39, 0.42]}>
          <sphereGeometry args={[1, 24, 20]} />
          <meshStandardMaterial color="#fff0d8" roughness={0.9} />
        </mesh>
        <group ref={tailRef} position={[-0.76, 0.91, -0.02]}>
          <mesh position={[-0.18, 0.13, 0]} rotation={[0, 0, -0.75]} scale={[0.14, 0.36, 0.15]}>
            <capsuleGeometry args={[0.42, 0.52, 6, 10]} />
            <meshStandardMaterial color="#d89155" roughness={0.8} />
          </mesh>
          <mesh position={[-0.33, 0.41, 0]} rotation={[0, 0, -0.2]} scale={[0.13, 0.31, 0.14]}>
            <capsuleGeometry args={[0.4, 0.42, 6, 10]} />
            <meshStandardMaterial color="#d89155" roughness={0.8} />
          </mesh>
          <mesh position={[-0.23, 0.65, 0]} rotation={[0, 0, 0.55]} scale={[0.13, 0.25, 0.14]}>
            <capsuleGeometry args={[0.38, 0.3, 6, 10]} />
            <meshStandardMaterial color="#d89155" roughness={0.8} />
          </mesh>
          <mesh position={[-0.06, 0.82, 0]} scale={[0.15, 0.16, 0.15]}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial color="#efbb7c" roughness={0.78} />
          </mesh>
        </group>

        {[-0.43, 0.42].flatMap((x, pairIndex) =>
          [-0.25, 0.25].map((z, sideIndex) => {
            const index = pairIndex * 2 + sideIndex;
            return (
              <group
                key={`leg-${index}`}
                ref={(element) => { legsRef.current[index] = element; }}
                position={[x, 0.43, z]}
              >
                <mesh position={[0, -0.16, 0]} scale={[0.17, 0.28, 0.16]}>
                  <capsuleGeometry args={[0.38, 0.2, 5, 8]} />
                  <meshStandardMaterial color={index > 1 ? '#da965c' : '#efb679'} roughness={0.84} />
                </mesh>
                <mesh position={[0.055, -0.35, 0.025]} scale={[0.22, 0.13, 0.19]}>
                  <sphereGeometry args={[1, 20, 14]} />
                  <meshStandardMaterial color="#f8d5ae" roughness={0.86} />
                </mesh>
                {[-0.07, 0, 0.07].map((toe) => (
                  <mesh key={toe} position={[0.21, -0.36, toe]} scale={[0.075, 0.025, 0.035]}>
                    <sphereGeometry args={[1, 12, 8]} />
                    <meshStandardMaterial color="#d99973" roughness={0.75} />
                  </mesh>
                ))}
              </group>
            );
          }),
        )}
      </group>

      <group ref={headRef} position={[0.31, 1.28, 0.02]}>
        <mesh scale={[0.52, 0.52, 0.47]} castShadow>
          <sphereGeometry args={[1, 32, 24]} />
          <meshStandardMaterial color="#f0b979" roughness={0.78} />
        </mesh>
        <group ref={leftEarRef} position={[-0.34, 0.39, 0]}>
          <mesh rotation={[0, 0, -0.2]} scale={[0.24, 0.34, 0.15]}>
            <coneGeometry args={[0.5, 1, 4]} />
            <meshStandardMaterial color="#e3a76b" roughness={0.78} />
          </mesh>
          <mesh position={[0, -0.02, 0.105]} rotation={[0, 0, -0.2]} scale={[0.12, 0.2, 0.035]}>
            <coneGeometry args={[0.5, 1, 4]} />
            <meshStandardMaterial color="#e58c91" roughness={0.8} />
          </mesh>
        </group>
        <group ref={rightEarRef} position={[0.34, 0.39, 0]}>
          <mesh rotation={[0, 0, 0.2]} scale={[0.24, 0.34, 0.15]}>
            <coneGeometry args={[0.5, 1, 4]} />
            <meshStandardMaterial color="#e3a76b" roughness={0.78} />
          </mesh>
          <mesh position={[0, -0.02, 0.105]} rotation={[0, 0, 0.2]} scale={[0.12, 0.2, 0.035]}>
            <coneGeometry args={[0.5, 1, 4]} />
            <meshStandardMaterial color="#e58c91" roughness={0.8} />
          </mesh>
        </group>
        <mesh ref={leftEyeRef} position={[-0.18, 0.04, 0.42]} scale={[0.057, 0.082, 0.04]}>
          <sphereGeometry args={[1, 20, 16]} />
          <meshStandardMaterial color="#422b24" roughness={0.35} />
        </mesh>
        <mesh ref={rightEyeRef} position={[0.18, 0.04, 0.42]} scale={[0.057, 0.082, 0.04]}>
          <sphereGeometry args={[1, 20, 16]} />
          <meshStandardMaterial color="#422b24" roughness={0.35} />
        </mesh>
        <mesh position={[-0.195, 0.07, 0.455]} scale={[0.018, 0.022, 0.014]}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshBasicMaterial color="#fff7e8" />
        </mesh>
        <mesh position={[0.165, 0.07, 0.455]} scale={[0.018, 0.022, 0.014]}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshBasicMaterial color="#fff7e8" />
        </mesh>
        <mesh position={[0, -0.12, 0.48]} scale={[0.21, 0.14, 0.16]}>
          <sphereGeometry args={[1, 20, 14]} />
          <meshStandardMaterial color="#ffebd7" roughness={0.92} />
        </mesh>
        <mesh position={[0, -0.07, 0.615]} scale={[0.062, 0.047, 0.035]}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial color="#bd6d70" roughness={0.52} />
        </mesh>
        <mesh position={[-0.075, -0.19, 0.59]} rotation={[0, 0, -0.48]} scale={[0.014, 0.065, 0.014]}>
          <capsuleGeometry args={[0.5, 0.5, 3, 6]} />
          <meshStandardMaterial color="#775047" roughness={0.8} />
        </mesh>
        <mesh position={[0.075, -0.19, 0.59]} rotation={[0, 0, 0.48]} scale={[0.014, 0.065, 0.014]}>
          <capsuleGeometry args={[0.5, 0.5, 3, 6]} />
          <meshStandardMaterial color="#775047" roughness={0.8} />
        </mesh>
        {[-1, 1].flatMap((side) =>
          [-0.08, -0.16].map((height) => (
            <mesh
              key={`whisker-${side}-${height}`}
              position={[side * 0.27, height, 0.47]}
              rotation={[0, 0, side * -0.16]}
              scale={[0.22, 0.008, 0.008]}
            >
              <capsuleGeometry args={[0.5, 0.5, 2, 5]} />
              <meshStandardMaterial color="#d3a681" roughness={0.9} />
            </mesh>
          )),
        )}
      </group>

      <mesh position={[-0.1, 0.025, -0.2]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.8, 0.45, 1]}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial color="#4c3b44" transparent opacity={0.17} depthWrite={false} />
      </mesh>

      <Html position={[0.32, 2.36, 0.1]} center transform={false} zIndexRange={[2, 0]}>
        {message && (
          <div className="dashboard-cat-bubble" role="status" aria-live="polite">
            {message}
          </div>
        )}
      </Html>
      <Html position={[0, 0.78, 0.58]} center transform={false} zIndexRange={[2, 0]}>
        <button
          className="dashboard-cat-hitbox"
          type="button"
          aria-label="Say hello to the FocusLens cat"
          title="Click to say hello"
          onPointerEnter={onHover}
          onClick={onClick}
        />
      </Html>
    </group>
  );
}

export default function DashboardCatMascot() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [message, setMessage] = useState<string | null>(CHAT_MESSAGES[0]);
  const messageIndexRef = useRef(0);
  const approachStartedRef = useRef<number | null>(null);
  const messageTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener('change', updatePreference);
    const initialMessageTimer = window.setTimeout(() => setMessage(null), 4_000);
    return () => {
      preference.removeEventListener('change', updatePreference);
      window.clearTimeout(initialMessageTimer);
      if (messageTimerRef.current !== null) window.clearTimeout(messageTimerRef.current);
    };
  }, []);

  const showMessage = useCallback((text: string, duration = 2_800) => {
    setMessage(text);
    if (messageTimerRef.current !== null) window.clearTimeout(messageTimerRef.current);
    messageTimerRef.current = window.setTimeout(() => setMessage(null), duration);
  }, []);

  const handleClick = useCallback(() => {
    messageIndexRef.current = (messageIndexRef.current + 1) % CHAT_MESSAGES.length;
    showMessage(CHAT_MESSAGES[messageIndexRef.current], 3_200);
    approachStartedRef.current = performance.now() / 1_000;
  }, [showMessage]);

  const handleHover = useCallback(() => {
    showMessage('Hello there!', 2_400);
  }, [showMessage]);

  return (
    <div className="dashboard-cat-layer" aria-label="Interactive 3D cat mascot">
      <Canvas
        orthographic
        camera={{ position: [0, 0, 20], zoom: 50, near: 0.1, far: 100 }}
        dpr={[1, 1.5]}
        frameloop={reducedMotion ? 'demand' : 'always'}
        gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
        style={{ pointerEvents: 'none' }}
      >
        <ambientLight intensity={1.9} />
        <directionalLight position={[-3, 6, 8]} intensity={2.5} color="#fff2dd" />
        <directionalLight position={[4, 2, -4]} intensity={0.7} color="#c3b7ff" />
        <CatModel
          reducedMotion={reducedMotion}
          message={message}
          approachStarted={approachStartedRef}
          onHover={handleHover}
          onClick={handleClick}
        />
      </Canvas>
    </div>
  );
}
