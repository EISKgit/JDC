export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <defs>
        <linearGradient id="jdc-logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#jdc-logo-gradient)" />
      <path d="M7 19.5 12 14l4 4 4.5-6L25 16.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="16.5" r="2" fill="#fff" />
    </svg>
  );
}
