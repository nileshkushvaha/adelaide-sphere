/** Adelaide Sphere mark: an original sphere of meridians, drawn inline so it costs no request and inherits the surrounding colour. */
export function BrandMark({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="as-brand-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--as-sky-700)" />
          <stop offset="1" stopColor="var(--as-teal-700)" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill="url(#as-brand-gradient)" />
      <g fill="none" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.9">
        <ellipse cx="20" cy="20" rx="8.5" ry="19" />
        <path d="M2.4 13.5h35.2M2.4 26.5h35.2" />
      </g>
      <circle cx="20" cy="20" r="4.4" fill="#ffffff" />
    </svg>
  );
}
