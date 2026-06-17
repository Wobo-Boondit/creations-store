// Verified checkmark shown next to verified usernames. Material-style scalloped
// seal (currentColor) with a check punched in the background colour. Sized via
// `className` (defaults to 1em so it scales with surrounding text).
export function VerifiedBadge({
  className = "",
  title = "Verified",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={title}
      className={`inline-block shrink-0 text-primary ${className}`}
      style={{ width: "1em", height: "1em" }}
    >
      <title>{title}</title>
      {/* Scalloped seal */}
      <path
        fill="currentColor"
        d="M23 12l-2.44-2.78.34-3.68-3.61-.82-1.89-3.18L12 3 8.6 1.54 6.71 4.72l-3.61.81.34 3.69L1 12l2.44 2.78-.34 3.69 3.61.82 1.89 3.18L12 21l3.4 1.46 1.89-3.18 3.61-.82-.34-3.68z"
      />
      {/* Check */}
      <path
        fill="hsl(var(--background))"
        d="M10.09 16.72l-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48z"
      />
    </svg>
  );
}
