export function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="stat-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
