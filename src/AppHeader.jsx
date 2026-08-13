import bowserLogo from "./assets/bowser-mascot-lockup.png";

const NAV_ITEMS = [
  { key: "players", label: "Player Database", href: "#/players" },
  { key: "team-box-scores", label: "Team Box Scores", href: "#/team-box-scores" },
];

export function AppHeader({ currentPage }) {
  return (
    <header className="app-header">
      <a className="brand-lockup" href="#/players" aria-label="Bowser home">
        <img src={bowserLogo} alt="Bowser" />
      </a>
      <nav className="primary-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.key}
            href={item.href}
            className={currentPage === item.key ? "active" : ""}
            aria-current={currentPage === item.key ? "page" : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
