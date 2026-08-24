import { useEffect, useRef, useState } from 'react';
import type { Grade } from '../data/types';
import type { FinishedResult } from '../state/gameState';
import { Button } from './Button';
import styles from './ShareOverlay.module.css';
import { useLockBodyScroll } from '../lib/useLockBodyScroll';

interface ShareOverlayProps {
  result: FinishedResult;
  grade: Grade;
  onClose: () => void;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let curY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, curY);
      line = word;
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, curY);
}

/** SCR-91 / FR-CM-11 / 6-3: 점수·등급·게임 아이콘이 담긴 카드 이미지를 Canvas로 렌더링한다. */
function drawCard(canvas: HTMLCanvasElement, result: FinishedResult, grade: Grade) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const W = canvas.width;
  const H = canvas.height;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0d3b33');
  bg.addColorStop(0.55, '#092e27');
  bg.addColorStop(1, '#061f1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(42,191,158,0.14)';
  ctx.beginPath();
  ctx.arc(W - 60, 100, 150, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#a9d3c7';
  ctx.font = '600 20px "Pretendard Variable", sans-serif';
  ctx.fillText('VETERANS DATA ARCADE', 46, 84);

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 30px "Pretendard Variable", sans-serif';
  wrapText(ctx, result.title, 46, 140, W - 92, 38);

  ctx.fillStyle = '#45cbaa';
  ctx.font = '600 122px "Pretendard Variable", sans-serif';
  ctx.fillText(String(result.score), 46, 340);

  ctx.fillStyle = '#a9d3c7';
  ctx.font = '600 26px "Pretendard Variable", sans-serif';
  ctx.fillText('/ 500점', 46, 382);

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 44px "Pretendard Variable", sans-serif';
  ctx.fillText(`${grade.icon} 보훈 ${grade.name}`, 46, 458);

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(46, 500);
  ctx.lineTo(W - 46, 500);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '500 18px "Pretendard Variable", sans-serif';
  wrapText(ctx, '본 콘텐츠는 한국보훈복지의료공단 공공데이터를 활용하여 제작되었습니다.', 46, 545, W - 92, 26);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '500 15px "Pretendard Variable", sans-serif';
  ctx.fillText(new Date().toLocaleDateString('ko-KR'), 46, H - 40);
}

export function ShareOverlay({ result, grade, onClose }: ShareOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useLockBodyScroll();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (document.fonts?.ready) await document.fonts.ready;
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) throw new Error('canvas not mounted');
        drawCard(canvas, result, grade);
        if (!cancelled) setReady(true);
      } catch {
        // 기능설계서 8장: 이미지 생성 실패 시 공유/다운로드 버튼만 비활성화, 게임 진행에는 영향 없음
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [result, grade]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `bohun-arcade-${result.gameId}-${result.score}.png`;
      link.click();
    } catch {
      setFailed(true);
    }
  };

  const handleShare = () => {
    const canvas = canvasRef.current;
    if (!canvas || !navigator.share) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        const file = new File([blob], 'bohun-arcade.png', { type: 'image/png' });
        if (navigator.canShare && !navigator.canShare({ files: [file] })) {
          handleDownload();
          return;
        }
        await navigator.share({
          files: [file],
          title: '보훈데이터 아케이드',
          text: `내 점수는 ${result.score}점, 보훈 ${grade.name} 등급!`,
        });
      } catch {
        // 사용자가 공유를 취소한 경우 등 - 조용히 무시
      }
    }, 'image/png');
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="결과 공유하기">
      <div className={styles.panel}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">
          ✕
        </button>
        <span className={styles.eyebrow}>SHARE YOUR RESULT</span>
        <span className={styles.title}>결과 카드를 저장해 보세요</span>

        <div className={styles.canvasWrap}>
          <canvas ref={canvasRef} width={600} height={800} className={styles.canvas} />
          {!ready && !failed && <span className={styles.hint}>카드 이미지를 만드는 중...</span>}
          {failed && <span className={styles.errorHint}>이미지 생성에 실패했어요. 게임 결과 자체는 정상 저장됐어요.</span>}
        </div>

        <div className={styles.actions}>
          <Button variant="outlineMuted" onClick={onClose}>
            닫기
          </Button>
          {canShare && (
            <Button variant="ink" onClick={handleShare} disabled={!ready || failed}>
              공유하기
            </Button>
          )}
          <Button variant="accent" onClick={handleDownload} disabled={!ready || failed}>
            이미지 다운로드
          </Button>
        </div>
      </div>
    </div>
  );
}
