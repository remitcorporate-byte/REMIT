import type { PlatformSupportSummary } from "../platform-api";
import "./platform-metrics.css";

export function QueueMetrics({
  summary,
}: {
  summary: PlatformSupportSummary | null;
}) {
  return (
    <section className="platform-metrics">
      <Metric label="Open" value={summary?.open} />
      <Metric label="Unassigned" value={summary?.unassigned} />
      <Metric label="Waiting on customer" value={summary?.waitingForCustomer} />
      <Metric label="Urgent" value={summary?.urgent} accent />
      <Metric label="Resolved" value={summary?.resolved} />
    </section>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value?: number;
  accent?: boolean;
}) {
  return (
    <article className={accent ? "is-accent" : ""}>
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </article>
  );
}
