import { useEffect, useRef, useState } from 'react';
import { PageControls } from './PageControls.jsx';
import './YahooConnection.css';

const API = '/api/v1/auth/yahoo/';
const RESULTS = {
  declined: 'Yahoo authorization was declined. You can reconnect when ready.',
  invalid_state: 'The connection request expired or came from a different browser. Please reconnect.',
  authorization_expired: 'Yahoo could not complete authorization. Reconnect; if it repeats, check the app credentials and callback.',
  missing_code: 'Yahoo did not return an authorization code. Please reconnect.',
  connection_failed: 'The Yahoo connection could not be completed. Please reconnect.',
  invalid_token_response: 'Yahoo returned an incomplete token response. Please reconnect.',
  session_too_large: 'Yahoo returned a session too large to store securely. Connection setup needs review.',
};
async function request(action, options = {}) {
  const response = await fetch(`${API}${action}`, { credentials: 'same-origin', cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'The Yahoo request failed.');
  return data;
}
export function YahooConnection({ season = 2026 }) {
  const [status, setStatus] = useState(null);
  const [account, setAccount] = useState(null);
  const [roster, setRoster] = useState(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => RESULTS[new URLSearchParams(window.location.hash.split('?')[1]).get('result')] || '');
  const [refreshMessage, setRefreshMessage] = useState('');
  const revision = useRef(0);
  async function load() {
    const id = ++revision.current;
    setBusy(true); setAccount(null); setRoster(null); setSelected('');
    try {
      const next = await request('status');
      if (id !== revision.current) return;
      setStatus(next);
      if (next.connected) {
        const data = await request(`leagues?season=${season}`);
        if (id === revision.current) setAccount(data);
      }
    } catch (e) { if (id === revision.current) setError(e.message); }
    finally { if (id === revision.current) setBusy(false); }
  }
  useEffect(() => { load(); return () => { revision.current++; }; }, [season]);
  async function action(kind) {
    const id = ++revision.current;
    setBusy(true); setError(''); setRefreshMessage('');
    try {
      if (kind === 'disconnect') {
        await request('disconnect', { method: 'POST' });
        if (id !== revision.current) return;
        setAccount(null); setRoster(null); setSelected(''); setStatus(s => ({ ...s, connected: false }));
      } else if (kind === 'refresh') {
        await request('refresh', { method: 'POST' });
        const data = await request(`leagues?season=${season}`);
        if (id !== revision.current) return;
        setAccount(data); setRefreshMessage('Token refresh passed; league access verified again.');
      } else {
        setRoster(null);
        const data = await request(`roster?season=${season}&team=${encodeURIComponent(kind)}`);
        if (id === revision.current) setRoster(data);
      }
    } catch (e) { if (id === revision.current) setError(e.message); }
    finally { if (id === revision.current) setBusy(false); }
  }
  const connect = status?.connectionUrl ? `${status.connectionUrl.split('/#/')[0]}${API}start` : `${API}start`;
  return <main className="page-content yahoo-connection">
    <PageControls title="Yahoo Connection" summary={<><span>{season} NFL</span><span>{status?.connected ? 'Yahoo authorized' : 'Not connected'}</span><span>Private · read only</span></>} actions={<>
      {status?.configured && <a className="yahoo-button" href={connect}>{status.connected ? 'Switch Yahoo account' : 'Connect Yahoo'}</a>}
      {status?.connected && <button disabled={busy} onClick={() => action('disconnect')}>Disconnect</button>}
    </>}>
      <p>Sign in with the Yahoo account that owns your fantasy teams. Your developer contact email does not select your leagues.</p>
      <p>This connection lasts up to eight hours in this browser. Tokens are encrypted in Secure, HttpOnly cookies and readable only by the server. League data stays in this page’s memory; it is not saved to the public player database. Background imports are not enabled.</p>
      <p>Disconnect clears this browser’s session. To revoke the app’s Yahoo permission, visit <a href="https://login.yahoo.com/account/security" target="_blank" rel="noreferrer">Yahoo account security</a>.</p>
    </PageControls>
    {error && <p role="alert" className="yahoo-notice">{error}</p>}
    {busy && <p role="status">Checking Yahoo…</p>}
    {status && !status.configured && <p role="alert">This deployment needs the Yahoo Client ID, Client Secret, and registered HTTPS callback configured before connecting.</p>}
    {status?.configured && !status.connected && <p className="yahoo-notice">Connect Yahoo to test access to your real leagues and rosters. Yahoo will ask you to sign in and approve read access.</p>}
    {status?.connected && <section aria-label="Yahoo connection checks">
      <div className="yahoo-toolbar"><button disabled={busy} onClick={() => { setError(''); load(); }}>Reload leagues</button><button disabled={busy} onClick={() => action('refresh')}>Test token refresh</button><span>{account ? `${account.leagues.length} leagues · ${account.teams.length} teams` : 'League access not yet verified'}</span></div>
      {refreshMessage && <p role="status">{refreshMessage}</p>}
      {account && <>
        <p>Retrieved {new Date(account.checkedAt).toLocaleString()}. Confirm these are your expected leagues.</p>
        {!account.leagues.length && <p>No NFL leagues were returned for {season}. Check the season or switch Yahoo accounts.</p>}
        <div className="yahoo-table-wrap"><table><caption>Your Yahoo leagues · {season}</caption><thead><tr><th>League</th><th>Season</th><th>Teams</th><th>Current week</th><th>Scoring type</th><th>Your team</th></tr></thead><tbody>
          {account.leagues.map(l => <tr key={l.key}><td>{l.name}</td><td>{l.season}</td><td>{l.teams ?? '—'}</td><td>{l.week ?? '—'}</td><td>{l.scoring || '—'}</td><td>{account.teams.filter(t => t.leagueKey === l.key).map(t => <button key={t.key} disabled={busy} aria-pressed={selected === t.key} onClick={() => { setSelected(t.key); action(t.key); }}>{t.name} · View roster</button>)}</td></tr>)}
        </tbody></table></div>
      </>}
      {roster && <div className="yahoo-table-wrap"><table><caption>{account?.teams.find(t => t.key === roster.teamKey)?.name || 'Your team'} · {roster.week ? `Week ${roster.week}` : 'Current roster'} · {roster.players.length} players</caption><thead><tr><th>Slot</th><th>Player</th><th>Position</th><th>NFL team</th><th>Status</th></tr></thead><tbody>{roster.players.map(p => <tr key={p.key}><td>{p.slot || '—'}</td><td>{p.name}</td><td>{p.position || '—'}</td><td>{p.team || '—'}</td><td>{p.status || '—'}</td></tr>)}</tbody></table>{!roster.players.length && <p>Yahoo returned an empty roster.</p>}</div>}
    </section>}
    <p className="yahoo-attribution"><a href="https://fantasysports.yahoo.com/" target="_blank" rel="noreferrer">Fantasy data provided by Yahoo Fantasy</a></p>
  </main>;
}
