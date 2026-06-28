import type { HTMLAttributes, ReactNode } from "react";

type PlayerCardProps = {
  position: string;
  club: string;
  name: string;
  pointsLabel: string;
  scoreBadge?: string | null;
  advancementBadge?: string | null;
  draggable?: boolean;
  inactive?: boolean;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>;

export function PlayerCard({
  position,
  club,
  name,
  pointsLabel,
  scoreBadge,
  advancementBadge,
  draggable = false,
  inactive = false,
  children,
  className,
  ...rest
}: PlayerCardProps) {
  return (
    <article className={`player-card ${draggable ? "draggable" : ""} ${inactive ? "player-card--inactive" : ""} ${className ?? ""}`.trim()} draggable={draggable && !inactive} {...rest}>
      {advancementBadge ? <span className="player-advancement-badge">{advancementBadge}</span> : null}
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
