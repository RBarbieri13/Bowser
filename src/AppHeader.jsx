import { Football, Table } from "@phosphor-icons/react";
import bowserLogo from "./assets/bowser-logo.png";

const NAV_ITEMS = [
  { key: "players", label: "Player Database", href: "#/players", icon: Table },
  { key: "team-box-scores", label: "Team Box Scores", href: "#/team-box-scores", icon: Football },
];

export function AppHeader({ currentPage }) {
  return (
    <header className="app-header">
      <div className="brand-row">
        <a className="brand-lockup" href="#/players" aria-label="Bowser home">
          <img src={bowserLogo} alt="Bowser" />
        </a>
        <span className="brand-season">2025</span>
      </div>
      <nav className="primary-nav" aria-label="Main navigation">
        {NAV_ITEMS.map(({ icon: Icon, ...item }) => (
          <a
            key={item.key}
            href={item.href}
            className={currentPage === item.key ? "active" : ""}
            aria-current={currentPage === item.key ? "page" : undefined}
          >
            <Icon weight="bold" aria-hidden="true" />
            {item.label}
          </a>
        ))}
      </nav>
      <p className="sidebar-attribution">Data: nflverse · CC BY 4.0</p>
    </header>
  );
}
