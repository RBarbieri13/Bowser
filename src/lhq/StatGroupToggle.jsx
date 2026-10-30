import './statGroupToggle.css';

const GROUPS = {
  usage: { name: 'Usage', short: 'USG', color: '#65d8ac', stats: 'Games played, snaps, snap percentage and snap trend' },
  passing: { name: 'Passing', short: 'PASS', color: '#72b9ed', stats: 'Attempts, completions, yards, touchdowns and pass trend' },
  rushing: { name: 'Rushing', short: 'RUSH', color: '#edbf70', stats: 'Attempts, yards, touchdowns and rush trend' },
  receiving: { name: 'Receiving', short: 'REC', color: '#b89aff', stats: 'Targets, receptions, yards, touchdowns and target trend' },
  dfs: { name: 'DFS', short: 'DFS', color: '#d8bf79', stats: 'Salary, projection and value' },
  draft: { name: 'Draft', short: 'DFT', color: '#c3ced9', stats: 'Average draft position and positional rank' },
  fantasy: { name: 'Fantasy', short: 'FPTS', color: '#65d8ac', stats: 'Fantasy points, trend, average, finish, activity and ownership' },
};

// A consistent 24px drawing grid keeps these semantic silhouettes legible at 20px.
function GroupIcon({ group }) {
  const shapes = {
    usage: <><path d="M3 20h18M5 16v-4h3v4m3 0V8h3v8m3 0V4h3v12" /><path d="m4 7 4-3 4 1 6-3" /></>,
    passing: <><path d="M3 13c0-4 3-7 8-7 0 5-3 8-7 8Zm1-1 5-4m-3 1 2 2" /><path d="M10 19c6 0 10-4 10-11m-4 2 4-3 2 4" /></>,
    rushing: <><circle cx="15" cy="4" r="2" /><path d="m12 8-4 4 4 3-4 6m4-13 4 5 4-1m-8 3 4 2 2 4M3 8h4m-6 4h3m-1 4h3" /><ellipse cx="7" cy="8" rx="2" ry="1.3" transform="rotate(-30 7 8)" /></>,
    receiving: <><path d="m3 12 2 5 4 4h6l4-4 2-5M5 17V9c0-1 2-1 2 0v4m12 4V9c0-1-2-1-2 0v4M7 13l3 3m7-3-3 3" /><path d="M9 7c0-3 2-5 6-5 0 4-2 6-5 6Zm1-1 3-2" /></>,
    dfs: <><ellipse cx="10" cy="6" rx="7" ry="3" /><path d="M3 6v5c0 2 4 3 7 3M3 11v5c0 2 4 3 7 3m7-13v4" /><circle cx="17" cy="17" r="5" /><path d="M18.5 15.5h-2a1 1 0 0 0 0 2h1a1 1 0 0 1 0 2h-2M17 14v1.5m0 4V21" /></>,
    draft: <><path d="M8 4H5v18h14V4h-3M9 2h6v4H9Z" /><path d="m8 11 1 1 2-2m2 1h3m-8 5 1 1 2-2m2 1h3" /></>,
    fantasy: <><path d="M7 3h10v5a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4m-4 1v5m-4 3v-3h8v3Z" /><path d="m12 5 .7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2Z" /></>,
  };
  return <svg className="lhq-stat-group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[group]}</svg>;
}

export function StatGroupToggle({ group, collapsed, onToggle }) {
  const definition = GROUPS[group];
  const action = collapsed ? 'Show' : 'Hide';
  return <button type="button" className="lhq-section-toggle lhq-stat-group-toggle" data-collapsed={collapsed} style={{ '--stat-group-color': definition.color }} aria-label={`${action} ${group} section`} aria-expanded={!collapsed} title={`${action} ${definition.name} columns · ${definition.stats}`} onClick={onToggle}>
    <span className="lhq-stat-group-symbol"><GroupIcon group={group} /><svg className="lhq-stat-group-state" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5h6" />{collapsed && <path d="M5 2v6" />}</svg></span>
    {collapsed && <span className="lhq-stat-group-caption" aria-hidden="true">{definition.short}</span>}
  </button>;
}
