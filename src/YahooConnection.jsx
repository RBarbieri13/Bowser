import { useEffect, useRef, useState } from 'react';
import { PageControls } from './PageControls.jsx';
import './YahooConnection.css';
import { YahooDashboard, yahooRequest } from './YahooDashboard.jsx';

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
const request = yahooRequest;
export function YahooConnection({ season = 2026, onOpenPlayer }) {
  const [status, setStatus] = useState(null);
  const [account, setAccount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => RESULTS[new URLSearchParams(window.location.hash.split('?')[1]).get('result')] || '');
  const [refreshMessage, setRefreshMessage] = useState('');
  const revision = useRef(0);
  async function load() {
    const id = ++revision.current;
    setBusy(true); setAccount(null);
    try {
      const next = await request('status');
      if (id !== revision.current) return;
      setStatus(next);
      if (next.connected) {
        const data = await request(`leagues?season=${season}`);
        if (id === revision.current) setAccount(data);
      }
    } catch (e) { if (id === revision.current) {setError(e.message);if(['not_connected','authorization_expired'].includes(e.code)){setAccount(null);setStatus(s=>({...s,connected:false}));}} }
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
        setAccount(null); setStatus(s => ({ ...s, connected: false }));
      } else if (kind === 'refresh') {
        await request('refresh', { method: 'POST' });
        const data = await request(`leagues?season=${season}`);
        if (id !== revision.current) return;
        setAccount(data); setRefreshMessage('Token refresh passed; league access verified again.');

      }
    } catch (e) { if (id === revision.current) {setError(e.message);if(['not_connected','authorization_expired'].includes(e.code)){setAccount(null);setStatus(s=>({...s,connected:false}));}} }
    finally { if (id === revision.current) setBusy(false); }
  }
  const connect = status?.connectionUrl ? `${status.connectionUrl.split('/#/')[0]}${API}start` : `${API}start`;
  return <main className="page-content yahoo-connection">
    <PageControls title="Yahoo Dashboard" summary={<><span>{season} NFL</span><span>{status?.connected ? 'Yahoo authorized' : 'Not connected'}</span><span>Private · read only</span></>} actions={<>
      {status?.configured && !status.connected && <a className="yahoo-button" href={connect}>Connect Yahoo</a>}
      {status?.connected && <button disabled={busy} onClick={() => {setError('');load();}}>Refresh dashboard</button>}
    </>}>
      {status?.connected && <div className="yahoo-toolbar"><a className="yahoo-button" href={connect}>Switch Yahoo account</a><button disabled={busy} onClick={() => action('refresh')}>Test token refresh</button><button disabled={busy} onClick={() => action('disconnect')}>Disconnect</button></div>}
      <p>Sign in with the Yahoo account that owns your fantasy teams. Your developer contact email does not select your leagues.</p>
      <p>This connection lasts up to eight hours in this browser. Tokens are encrypted in Secure, HttpOnly cookies and readable only by the server. League data stays in this page’s memory; it is not saved to the public player database. Background imports are not enabled.</p>
      <p>Disconnect clears this browser’s session. To revoke the app’s Yahoo permission, visit <a href="https://login.yahoo.com/account/security" target="_blank" rel="noreferrer">Yahoo account security</a>.</p>
    </PageControls>
    {error && <p role="alert" className="yahoo-notice">{error}</p>}
    {busy && <p role="status">Checking Yahoo…</p>}
    {status && !status.configured && <p role="alert">This deployment needs the Yahoo Client ID, Client Secret, and registered HTTPS callback configured before connecting.</p>}
    {status?.configured && !status.connected && <p className="yahoo-notice">Connect Yahoo to see your teams, lineups, standings, and weekly matchups.</p>}
    {status?.connected && <section aria-label="Yahoo teams and leagues">

      {refreshMessage && <p role="status">{refreshMessage}</p>}
      {account && <YahooDashboard key={season} account={account} season={season} onOpenPlayer={onOpenPlayer} />}

    </section>}
    <p className="yahoo-attribution"><a href="https://fantasysports.yahoo.com/" target="_blank" rel="noreferrer">Fantasy data provided by Yahoo Fantasy</a></p>
  </main>;
}
