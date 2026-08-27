import { Broadcast, CaretLeft, CaretRight, ChartLineUp, Football, SquaresFour, Table } from "@phosphor-icons/react";
import bowserLogo from "./assets/bowser-logo.png";

const NAV_ITEMS = [
  { key: "league-hub", label: "League Hub", href: "#/league-hub", icon: SquaresFour },
  { key: "players", label: "Player Database", href: "#/players", icon: Table },
  { key: "intelligence", label: "Fantasy Intelligence", href: "#/intelligence", icon: Broadcast },
  { key: "team-box-scores", label: "Team Box Scores", href: "#/team-box-scores", icon: Football },
  { key: "opportunity-tracker", label: "Opportunity Tracker", href: "#/opportunity-tracker", icon: ChartLineUp },
];

export function AppHeader({ currentPage, width, collapsed, onResize }) {
  const startResize = (event) => {
    event.preventDefault();
    const origin = event.clientX;
    const initial = width;
    const move = (moveEvent) => onResize(initial + moveEvent.clientX - origin);
    const end = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end, { once: true });
  };
  const onResizeKey = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") return onResize(56);
    if (event.key === "End") return onResize(280);
    onResize(width + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 16 : 4));
  };
  return (
    <header className={`app-header${collapsed ? " collapsed" : ""}`}>
      <div className="brand-row">
        <a className="brand-lockup" href="#/players" aria-label="Bowser home">
          <img src={bowserLogo} alt="Bowser" />
        </a>
        <span className="brand-season">2025</span>
      </div>
      <button type="button" className="sidebar-collapse" onClick={() => onResize(collapsed ? 216 : 56)} aria-label={collapsed ? "Expand navigation sidebar" : "Collapse navigation sidebar"}>
        {collapsed ? <CaretRight weight="bold" /> : <CaretLeft weight="bold" />}
      </button>
      <nav className="primary-nav" aria-label="Main navigation">
        {NAV_ITEMS.map(({ icon: Icon, ...item }) => (
          <a
            key={item.key}
            href={item.href}
            className={currentPage === item.key ? "active" : ""}
            aria-current={currentPage === item.key ? "page" : undefined}
            title={collapsed ? item.label : undefined}
          >
            <Icon weight="bold" aria-hidden="true" />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
      <p className="sidebar-attribution">Data: nflverse · CC BY 4.0</p>
      <span
        className="sidebar-resizer"
        role="separator"
        tabIndex="0"
        aria-label="Resize navigation sidebar"
        aria-orientation="vertical"
        aria-valuemin="56"
        aria-valuemax="280"
        aria-valuenow={width}
        onPointerDown={startResize}
        onKeyDown={onResizeKey}
        onDoubleClick={() => onResize(collapsed ? 216 : 56)}
      />
    </header>
  );
}
