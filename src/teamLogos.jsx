export function teamLogoUrl(team) {
  const code = String(team || "").trim().toLowerCase();
  return code ? `https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png` : "";
}

export function gameTotalPoints(game) {
  const pointsFor = Number(game?.pointsFor);
  const pointsAgainst = Number(game?.pointsAgainst);
  if (game?.pointsFor !== null && game?.pointsFor !== undefined && game?.pointsAgainst !== null && game?.pointsAgainst !== undefined && Number.isFinite(pointsFor) && Number.isFinite(pointsAgainst)) return pointsFor + pointsAgainst;
  const score = String(game?.scoreLabel || "").match(/(\d+)\s*[-–]\s*(\d+)/);
  return score ? Number(score[1]) + Number(score[2]) : null;
}

export function TeamLogo({ team, className = "", decorative = false }) {
  const source = teamLogoUrl(team);
  if (!source) return null;
  return (
    <img
      className={className}
      src={source}
      alt={decorative ? "" : `${team} logo`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={(event) => { event.currentTarget.hidden = true; }}
    />
  );
}
