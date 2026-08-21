import { useMemo, type CSSProperties } from 'react';
import styles from './Confetti.module.css';

const COLORS = [
  'var(--color-accent)',
  'var(--color-accent-soft)',
  'var(--color-accent-pale)',
  'var(--color-fake)',
  'var(--color-pin)',
  '#f0b429',
];

const PIECE_COUNT = 20;

interface Piece {
  left: number;
  size: number;
  color: string;
  rounded: boolean;
  swayX: number;
  swayY: number;
  dx: number;
  dy: number;
  rotateMid: number;
  rotate: number;
  delay: number;
  duration: number;
}

/** 폭발이 아니라 위에서 나풀나풀 떨어지는 꽃가루/색종이 - 화면 위쪽 여러
 * 지점에서 시작해 좌우로 살짝 흔들리며(중간 지점에서 반대쪽으로 스윙) 아래로
 * 떨어진다. 한 번만 떨어지고 끝나는 게 아니라 화면에 떠 있는 동안 계속
 * 반복되므로(사용자 피드백), 조각마다 딜레이를 넓게 흩어 둬서(한 순환
 * 길이만큼) 다 같이 몰려 떨어지는 게 아니라 늘 몇 개는 떨어지고 있는
 * 것처럼 보이게 한다. 매번 렌더링마다 새로 계산해서 게임을 완료할 때마다
 * 조금씩 다르게 떨어진다. */
function makePieces(): Piece[] {
  return Array.from({ length: PIECE_COUNT }, () => {
    const fall = 130 + Math.random() * 90;
    const drift = (Math.random() - 0.5) * 70;
    const duration = 1.6 + Math.random() * 1;
    return {
      left: 4 + Math.random() * 92,
      size: 6 + Math.random() * 7,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rounded: Math.random() < 0.35,
      // 떨어지는 중간에 반대쪽으로 한 번 스윙했다가 최종 방향으로 - 나풀거리는 느낌.
      swayX: -drift * 0.6,
      swayY: fall * 0.45,
      dx: drift,
      dy: fall,
      rotateMid: (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 80),
      rotate: (Math.random() < 0.5 ? -1 : 1) * (140 + Math.random() * 220),
      // 순환 길이(duration)만큼 딜레이를 넓게 흩어서 반복될 때도 뭉치지 않게 한다.
      delay: Math.random() * duration,
      duration,
    };
  });
}

/** "게임 완료!" 결과 화면 히어로에서 계속 떨어지는 꽃가루/색종이 애니메이션
 * - 부모는 `position: relative` + `overflow: hidden`이어야 한다
 * (Result.module.css `.hero`). 원래는 고정된 위치의 사각형 4개짜리 정적
 * 장식이었는데, 실제로 흩날리며 떨어지는 애니메이션으로 바꿔달라는 요청
 * (사용자 피드백)에 따라 교체했다. */
export function Confetti() {
  const pieces = useMemo(() => makePieces(), []);
  return (
    <>
      {pieces.map((p, i) => (
        <span
          key={i}
          aria-hidden
          className={styles.piece}
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              background: p.color,
              borderRadius: p.rounded ? '50%' : 2,
              '--swayX': `${p.swayX}px`,
              '--swayY': `${p.swayY}px`,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--rotateMid': `${p.rotateMid}deg`,
              '--rotate': `${p.rotate}deg`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            } as CSSProperties
          }
        />
      ))}
    </>
  );
}
