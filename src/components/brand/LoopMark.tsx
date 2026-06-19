// The Loop brand mark — red disc + gold ring + white angular "Z".
// Vector path extracted from the design handoff (used in every prototype file).

interface LoopMarkProps {
  size?: number;
  className?: string;
  /** Glossy variant adds the seam-dash outer ring used on the login hero. */
  glossy?: boolean;
}

export function LoopMark({ size = 40, className, glossy = false }: LoopMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-100 -100 200 200"
      className={className}
      aria-label="Loop by Zak Cricket"
    >
      <circle r="83.19" fill="#9C1116" />
      {glossy ? (
        <>
          <circle r="78" fill="none" stroke="#C9A84C" strokeWidth="1.1" strokeOpacity="0.85" />
          <circle r="69" fill="none" stroke="#C9A84C" strokeWidth="1.1" strokeOpacity="0.85" />
          <circle
            r="73.5"
            fill="none"
            stroke="#C9A84C"
            strokeWidth="5.6"
            strokeDasharray="2 9"
            strokeLinecap="round"
          />
        </>
      ) : (
        <circle r="73" fill="none" stroke="#C9A84C" strokeWidth="4.4" />
      )}
      <path
        d="M23.6 -49.24 L11.04 -49.24 L11.04 -49.25 L-44.6 -49.25 L-28.43 -21.25 L-3.9 -21.25 L-5.74 -18.07 L-44.6 49.24 L-23.6 49.24 L-23.6 49.25 L44.6 49.24 L28.44 21.25 L3.9 21.25 L5.74 18.06 L44.6 -49.24 Z"
        fill="#FAF7F4"
      />
    </svg>
  );
}

interface WordmarkProps {
  size?: number;
  light?: boolean;
}

/** "LOOP / By Zak Cricket" lockup. */
export function Wordmark({ size = 25, light = false }: WordmarkProps) {
  return (
    <div className="flex items-center gap-3">
      <LoopMark size={size * 1.6} />
      <div>
        <div
          className="font-display leading-[0.82] tracking-[0.04em]"
          style={{ fontSize: size, color: light ? '#FAF7F4' : undefined }}
        >
          LOOP
        </div>
        <div
          className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.32em]"
          style={{ color: light ? '#C9A84C' : '#6E0C10' }}
        >
          By Zak Cricket
        </div>
      </div>
    </div>
  );
}
