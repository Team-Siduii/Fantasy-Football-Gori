import type { HTMLAttributes, ReactNode } from "react";

type PlayerCardProps = {
  position: string;
  club: string;
  name: string;
  pointsLabel: string;
  draggable?: boolean;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>;

export function PlayerCard({
  position,
  club,
  name,
  pointsLabel,
  draggable = false,
  children,
  className,
  ...rest
}: PlayerCardProps) {
  return (
    <article className={`player-card ${draggable ? "draggable" : ""} ${className ?? ""}`.trim()} draggable={draggable} {...rest}>
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
