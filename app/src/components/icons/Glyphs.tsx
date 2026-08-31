import type { CSSProperties } from 'react';

/**
 * Small hand-drawn glyphs, ported 1:1 from the design source (absolutely
 * positioned divs rather than icon-font/SVG, matching how they were built
 * in the original prototype).
 */

const abs = (styles: CSSProperties): CSSProperties => ({ position: 'absolute', ...styles });

export function LogoMark({ size = 32 }: { size?: number }) {
  const barW = size * 0.11;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: 'var(--color-dark-1)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: size * 0.08,
        paddingBottom: size * 0.28,
        flex: 'none',
      }}
    >
      <span style={{ width: barW, height: size * 0.25, background: 'var(--color-accent-pale)', borderRadius: 1 }} />
      <span style={{ width: barW, height: size * 0.41, background: '#fff', borderRadius: 1 }} />
      <span style={{ width: barW, height: size * 0.31, background: 'var(--color-accent)', borderRadius: 1 }} />
    </div>
  );
}

/** Pin / map marker glyph - used on the 가장 가까운 위탁병원 찾기 card and question panel. */
export function LocationGlyph({ accent }: { accent: string }) {
  return (
    <>
      <div
        style={abs({
          left: '50%',
          top: '46%',
          transform: 'translate(-50%,-50%) rotate(-45deg)',
          width: 15,
          height: 15,
          border: `2px solid ${accent}`,
          borderRadius: '50% 50% 50% 0',
        })}
      />
      <div
        style={abs({
          left: '50%',
          top: '44%',
          transform: 'translate(-50%,-50%)',
          width: 5,
          height: 5,
          background: accent,
          borderRadius: '50%',
        })}
      />
    </>
  );
}

/** Hospital building + cross glyph - used on the 가장 가까운 위탁병원 찾기 question card. */
export function HospitalGlyph({ accent, size = 20 }: { accent: string; size?: number }) {
  return (
    <>
      <div
        style={abs({
          left: '50%',
          top: '50%',
          transform: 'translate(-50%,-50%)',
          width: size,
          height: size * 0.8,
          border: `2px solid ${accent}`,
          borderRadius: 3,
        })}
      />
      <div
        style={abs({
          left: '50%',
          top: '50%',
          transform: 'translate(-50%,-50%)',
          width: size * 0.45,
          height: 2.5,
          background: accent,
          borderRadius: 1,
        })}
      />
      <div
        style={abs({
          left: '50%',
          top: '50%',
          transform: 'translate(-50%,-50%)',
          width: 2.5,
          height: size * 0.45,
          background: accent,
          borderRadius: 1,
        })}
      />
      <div
        style={abs({
          left: '50%',
          bottom: size * 0.16,
          transform: 'translateX(-50%)',
          width: size * 1.4,
          height: 2,
          background: accent,
          borderRadius: 1,
          opacity: 0.4,
        })}
      />
    </>
  );
}

/** 동전(₩) glyph - used for 의료비 감각 테스트. */
export function CoinGlyph({ accent, size = 20 }: { accent: string; size?: number }) {
  return (
    <>
      <div
        style={abs({
          left: '50%',
          top: '50%',
          transform: 'translate(-50%,-50%)',
          width: size,
          height: size,
          border: `2px solid ${accent}`,
          borderRadius: '50%',
        })}
      />
      <div
        style={abs({
          left: '50%',
          top: '50%',
          transform: 'translate(-50%,-50%)',
          fontSize: size * 0.5,
          fontWeight: 700,
          lineHeight: 1,
          color: accent,
        })}
      >
        ₩
      </div>
    </>
  );
}

/** 2x2 card-back grid glyph - used for 짝맞추기 and the "게임 완료" result icon. */
export function MatchGlyph({ accent }: { accent: string }) {
  return (
    <>
      <div style={abs({ left: '24%', top: '24%', width: '18%', height: '18%', background: accent, borderRadius: 2 })} />
      <div
        style={abs({ right: '24%', top: '24%', width: '18%', height: '18%', background: accent, borderRadius: 2, opacity: 0.55 })}
      />
      <div
        style={abs({ left: '24%', bottom: '24%', width: '18%', height: '18%', background: accent, borderRadius: 2, opacity: 0.55 })}
      />
      <div style={abs({ right: '24%', bottom: '24%', width: '18%', height: '18%', background: accent, borderRadius: 2 })} />
    </>
  );
}
