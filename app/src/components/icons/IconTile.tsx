import type { CSSProperties, ReactNode } from 'react';

interface IconTileProps {
  size?: number;
  radius?: number;
  background?: string;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
}

/** Rounded square tile used as the backdrop for every hand-drawn glyph in the arcade. */
export function IconTile({
  size = 42,
  radius,
  background = 'var(--color-tint-1)',
  children,
  style,
  className,
}: IconTileProps) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.26),
        background,
        flex: 'none',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
