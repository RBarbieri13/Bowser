import { entities, metadata, numeric, leagueInfo } from './yahoo-dashboard.mjs';

const PAGE_SIZE = 25;
const TRANSACTION_LIMIT = 50;
const text = value => typeof value === 'string' ? value : '';
const playerInfo = player => ({
  key: text(player.player_key), name: text(metadata(player.name).full),
  position: text(player.display_position), team: text(player.editorial_team_abbr),
  status: text(player.status), statusDetail: text(player.status_full),
});

function collection(data, plural, singular, fail, leagueKey) {
  const leagues = entities(data, 'league');
  if (leagues.length !== 1 || leagues[0].league_key !== leagueKey) {
    fail('league_mismatch', 'Yahoo returned a different league collection.', 502);
  }
  const containers = entities(data, plural);
  if (containers.length !== 1) fail('invalid_data_response', 'Yahoo returned an unexpected collection.', 502);
  const items = entities(containers[0], singular);
  const count = numeric(containers[0].count);
  if (count === null || count !== items.length) fail('invalid_data_response', 'Yahoo returned an incomplete collection.', 502);
  return items;
}

function transactionInfo(transaction) {
  return {
    key: text(transaction.transaction_key), type: text(transaction.type), status: text(transaction.status),
    timestamp: numeric(transaction.timestamp),
    traderTeamKey: text(transaction.trader_team_key) || null,
    tradeeTeamKey: text(transaction.tradee_team_key) || null,
    players: entities(transaction.players, 'player').map(player => {
      const transfer = metadata(player.transaction_data);
      return { ...playerInfo(player), action: text(transfer.type),
        sourceTeamKey: text(transfer.source_team_key) || null,
        destinationTeamKey: text(transfer.destination_team_key) || null };
    }),
  };
}

// Routes follow https://sports.yahoo.com/developer/docs/ (Players and Transactions collections).
// Every request is bounded, sequential, private, read-only, and authorized by the caller first.
export async function queryLeagueResearch({ params, teamKey, season, query, fail, now }) {
  const requested = params.get('include') ?? 'availability,trades';
  const sections = [...new Set(requested.split(','))];
  if (!sections.length || sections.some(section => !['availability', 'trades', 'transactions'].includes(section))) {
    fail('invalid_include', 'Choose availability, trades, or transactions.');
  }
  const rawStart = params.get('availabilityStart') ?? '0';
  if (!/^(?:0|[1-9]\d{0,3})$/.test(rawStart) || Number(rawStart) > 5000) {
    fail('invalid_start', 'Availability start must be an integer from 0 to 5000.');
  }
  const start = Number(rawStart);
  const status = params.get('availabilityStatus') ?? 'FA';
  if (!['FA', 'W', 'A'].includes(status)) fail('invalid_status', 'Choose FA (free agents), W (waivers), or A (all available players).');
  const leagueKey = teamKey.split('.t.')[0];
  const league = leagueInfo(entities(await query(`league/${leagueKey}`), 'league')[0] || {});
  if (league.key !== leagueKey || league.season !== Number(season)) fail('league_mismatch', 'Yahoo returned a different league or season.', 502);
  const result = { season: Number(season), teamKey, leagueKey, availability: null, trades: null, transactions: null, errors: {} };
  for (const section of sections) {
    try {
      if (section === 'availability') {
        const data = await query(`league/${leagueKey}/players;status=${status};start=${start};count=${PAGE_SIZE}`);
        const players = collection(data, 'players', 'player', fail, leagueKey).map(playerInfo);
        if (players.length > PAGE_SIZE || players.some(player => !/^\d+\.p\.\d+$/.test(player.key) || !player.key.startsWith(`${leagueKey.split('.l.')[0]}.p.`))) {
          fail('invalid_data_response', 'Yahoo returned unexpected player identities or pagination.', 502);
        }
        const exhausted = players.length < PAGE_SIZE;
        result.availability = { status, players, start, pageSize: PAGE_SIZE, exhausted,
          complete: start === 0 && exhausted,
          nextStart: exhausted || start + PAGE_SIZE > 5000 ? null : start + PAGE_SIZE,
          limitReached: !exhausted && start + PAGE_SIZE > 5000,
          coverage: 'One page of the current league player pool; absence does not establish roster ownership.' };
      } else {
        const filter = section === 'trades' ? `type=pending_trade;team_key=${teamKey}` : 'types=add,drop,trade';
        const data = await query(`league/${leagueKey}/transactions;${filter};count=${TRANSACTION_LIMIT}`);
        const items = collection(data, 'transactions', 'transaction', fail, leagueKey).map(transactionInfo);
        const allowedTypes = section === 'trades' ? ['pending_trade'] : ['add', 'drop', 'add/drop', 'trade'];
        if (items.length > TRANSACTION_LIMIT || items.some(item => !item.key.startsWith(`${leagueKey}.`) || !allowedTypes.includes(item.type))) {
          fail('invalid_data_response', 'Yahoo returned unexpected transactions.', 502);
        }
        result[section] = { items, limit: TRANSACTION_LIMIT, complete: items.length < TRANSACTION_LIMIT,
          limitReached: items.length === TRANSACTION_LIMIT,
          coverage: section === 'trades' ? 'Current pending trades visible to the selected owned team.' : 'Most recent league adds, drops, and completed trades; excludes pending claims and pending trades.' };
      }
    } catch (error) {
      if (['authorization_expired', 'fantasy_access_denied', 'rate_limited'].includes(error.code)) throw error;
      result[section] = null;
      result.errors[section] = 'This Yahoo research section is unavailable; completeness and availability are unknown.';
    }
  }
  result.checkedAt = new Date(now()).toISOString();
  return result;
}
