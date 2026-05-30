import type { HTMLAttributes, ReactNode } from "react";

type PlayerCardProps = {
  position: string;
  club: string;
  name: string;
  pointsLabel: string;
  scoreBadge?: string | null;
  draggable?: boolean;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>;

export function PlayerCard({
  position,
  club,
  name,
  pointsLabel,
  scoreBadge,
  draggable = false,
  children,
  className,
  ...rest
}: PlayerCardProps) {
  return (
    <article className={`player-card ${draggable ? "draggable" : ""} ${className ?? ""}`.trim()} draggable={draggable} {...rest}>
      {scoreBadge ? <span className="player-score-badge">{scoreBadge}</span> : null}
      <div className="player-top">
        <span className="player-position">{position}</span>
        <span className="player-club">{club}</span>
      </div>
      <p className="player-name">{name}</p>
      <p className="player-points">{pointsLabel}</p>
      {children}
    </article>
  );
}
