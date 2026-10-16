/** Placeholder shapes while a page loads, instead of a bare "Loading..." line. Screen
 * readers get a single "Loading" announcement via aria-busy + the hidden label. */
export function PageSkeleton({ variant = "page" }: { variant?: "page" | "grid" }) {
  return (
    <div className="skeleton-page" aria-busy="true" role="status">
      <span className="sr-only">Loading</span>
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-block" />
      {variant === "grid" ? (
        <div className="skeleton-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton" />
          ))}
        </div>
      ) : (
        <div className="skeleton skeleton-block" />
      )}
    </div>
  );
}
