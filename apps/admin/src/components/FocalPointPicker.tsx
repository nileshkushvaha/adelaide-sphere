import { useRef } from 'react';
import { Typography } from 'antd';
import { brand } from '@/config/theme';

interface Props {
  src: string;
  alt: string;
  /** Fractions of the image's width and height; undefined means the centre. */
  x?: number;
  y?: number;
  onChange: (point: { x: number; y: number }) => void;
  disabled?: boolean;
}

const STEP = 0.05;
const clamp = (value: number) => Math.min(1, Math.max(0, Number(value.toFixed(3))));

/**
 * Sets the point of an image that must stay in frame when it is cropped.
 *
 * Two numbers between 0 and 1 are a poor way to say "her face, slightly left of
 * centre": nobody can picture 0.42, 0.31. Here the reader clicks the thing that
 * matters and sees where it lands.
 *
 * It is a real control, not a picture with a click handler: it takes focus, the
 * arrow keys move the point, and its value is announced — so it is usable
 * without a mouse (WCAG 2.1.1), which a drag-only picker would not be.
 */
export function FocalPointPicker({ src, alt, x, y, onChange, disabled = false }: Props) {
  const frame = useRef<HTMLButtonElement>(null);
  const px = x ?? 0.5;
  const py = y ?? 0.5;

  const setFromEvent = (event: React.MouseEvent) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || disabled) return;
    onChange({ x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) });
  };

  const nudge = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-STEP, 0],
      ArrowRight: [STEP, 0],
      ArrowUp: [0, -STEP],
      ArrowDown: [0, STEP],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onChange({ x: clamp(px + move[0]), y: clamp(py + move[1]) });
  };

  return (
    <div>
      <button
        ref={frame}
        type="button"
        onClick={setFromEvent}
        onKeyDown={nudge}
        disabled={disabled}
        aria-label={`Focal point for ${alt || 'this image'}: ${Math.round(px * 100)} per cent from the left and ${Math.round(py * 100)} per cent from the top. Click the image, or use the arrow keys.`}
        style={{
          position: 'relative',
          display: 'block',
          width: '100%',
          padding: 0,
          border: `1px solid ${brand.border}`,
          borderRadius: 10,
          overflow: 'hidden',
          background: brand.surfaceMuted,
          cursor: disabled ? 'default' : 'crosshair',
        }}
      >
        {/* The button already carries the name and the current value, so the
            picture inside it is decorative here — a second copy of the alt text
            would be read out twice. */}
        <img src={src} alt="" style={{ display: 'block', width: '100%' }} />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: `${px * 100}%`,
            top: `${py * 100}%`,
            width: 22,
            height: 22,
            marginLeft: -11,
            marginTop: -11,
            borderRadius: '50%',
            border: '2px solid #FFFFFF',
            // A second ring in ink so the marker survives a pale photograph.
            boxShadow: `0 0 0 2px ${brand.text}, 0 1px 6px rgba(15, 23, 42, 0.5)`,
          }}
        />
      </button>
      <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 6 }}>
        {x === undefined && y === undefined
          ? 'Not set — the middle of the image is kept in frame.'
          : `Keeping ${Math.round(px * 100)}% from the left and ${Math.round(py * 100)}% from the top in frame.`}
      </Typography.Text>
    </div>
  );
}
