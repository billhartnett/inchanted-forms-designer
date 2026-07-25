type MappingConfidenceProps = {
  confidenceScore: number;
  thresholds?: {
    accepted: number;
    review: number;
    rejected: number;
  };
};

function toneForScore(score: number) {
  if (score >= 0.8) return { background: "#dcfce7", color: "#166534" };
  if (score >= 0.6) return { background: "#fef3c7", color: "#92400e" };
  if (score >= 0.45) return { background: "#fee2e2", color: "#991b1b" };
  return { background: "#e2e8f0", color: "#334155" };
}

export function MappingConfidence({ confidenceScore, thresholds }: MappingConfidenceProps) {
  const tone = toneForScore(confidenceScore);
  const label = thresholds
    ? confidenceScore >= thresholds.accepted
      ? "accept"
      : confidenceScore >= thresholds.review
        ? "review"
        : "reject"
    : null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.2rem 0.45rem",
        borderRadius: 999,
        background: tone.background,
        color: tone.color,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {Math.round(confidenceScore * 100)}%
      {label ? ` • ${label}` : ""}
    </span>
  );
}