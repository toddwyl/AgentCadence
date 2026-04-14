export function BrandMark({
  className = 'size-5',
}: {
  className?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="14" width="6.5" height="6.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.25 6.75h4.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.25 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.25 17.25h4.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
