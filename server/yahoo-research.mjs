import { entities, metadata, numeric, leagueInfo } from './yahoo-dashboard.mjs';

const PAGE_SIZE = 25;
const TRANSACTION_LIMIT = 50;
const OWNERSHIP_LIMIT = 24;
const SEARCH_LIMIT = 10;
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
const teamCode = value => ({ JAC: 'JAX', LA: 'LAR', WSH: 'WAS' }[String(value || '').toUpperCase()] || String(value || '').toUpperCase());
const positionCode = value => ['D/ST', 'DST'].includes(String(value || '').toUpperCase()) ? 'DEF' : String(value || '').toUpperCase();
const cleanName = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]/g, '');
const identityKey = value => `${cleanName(value.name)}|${positionCode(value.position)}|${teamCode(value.team)}`;
const unique = rows => {
  const seen = new Map();
  for (const row of rows) {
    const key = identityKey(row);
    if (!key.startsWith('|')) seen.set(key, seen.has(key) ? null : row);
  }
  return seen;
};
function parsePlayers(params, fail) {
  const raw = params.get('players');
  if (!raw) return [];
  let players;
  try { players = JSON.parse(raw); } catch { fail('invalid_players', 'Choose valid player identities for Yahoo ownership lookup.'); }
  if (!Array.isArray(players) || players.length > OWNERSHIP_LIMIT) fail('invalid_players', `Choose at most ${OWNERSHIP_LIMIT} visible players for Yahoo ownership lookup.`);
  const seen = new Set();
  return players.map(player => {
    const item = player && typeof player === 'object' ? player : {};
    const id = text(item.id).slice(0, 120);
    const name = text(item.name).slice(0, 100);
    const team = teamCode(item.team).slice(0, 4);
    const position = positionCode(item.position).slice(0, 8);
    if (!id || seen.has(id) || !name || !team || !position) fail('invalid_players', 'Choose complete, unique player identities for Yahoo ownership lookup.');
    seen.add(id);
    return { id, name, team, position };
  });
}
function parsePlayerKeys(params, fail, gameKey) {
  const raw = params.get('playerKeys');
  if (!raw) return [];
  const keys = raw.split(',').filter(Boolean);
  if (!keys.length || keys.length > OWNERSHIP_LIMIT || keys.some(key => !new RegExp(`^${gameKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.p\\.\\d+$`).test(key))) {
    fail('invalid_player_keys', `Choose up to ${OWNERSHIP_LIMIT} valid Yahoo player keys from this season.`);
  }
  return [...new Set(keys)];
}
function ownershipInfo(player) {
  const own = metadata(player.ownership);
  const type = text(own.ownership_type) || null;
  const owned = type === 'team' ? true : ['freeagents', 'waivers'].includes(type) ? false : null;
  return { ...playerInfo(player), ownershipType: type, owned };
}
async function ownershipForKeys(keys, { query, fail, leagueKey }) {
  if (!keys.length) return new Map();
  const data = await query(`league/${leagueKey}/players;player_keys=${keys.join(',')}/ownership`);
  const players = collection(data, 'players', 'player', fail, leagueKey).map(ownershipInfo);
  if (players.some(player => !keys.includes(player.key) || player.owned === null)) fail('invalid_data_response', 'Yahoo returned incomplete player ownership.');
  return new Map(players.map(player => [player.key, player]));
}

// Routes follow https://sports.yahoo.com/developer/docs/ (Players and Transactions collections).
// Every request is bounded, sequential, private, read-only, and authorized by the caller first.
export async function queryLeagueResearch({ params, teamKey, season, query, fail, now }) {
  const requested = params.get('include') ?? 'availability,trades';
  const sections = [...new Set(requested.split(','))];
  if (!sections.length || sections.some(section => !['availability', 'trades', 'transactions', 'ownership'].includes(section))) {
    fail('invalid_include', 'Choose availability, trades, transactions, or ownership.');
  }
  const rawStart = params.get('availabilityStart') ?? '0';
  if (!/^(?:0|[1-9]\d{0,3})$/.test(rawStart) || Number(rawStart) > 5000) {
    fail('invalid_start', 'Availability start must be an integer from 0 to 5000.');
  }
  const start = Number(rawStart);
  const status = params.get('availabilityStatus') ?? 'FA';
  if (!['FA', 'W', 'A'].includes(status)) fail('invalid_status', 'Choose FA (free agents), W (waivers), or A (all available players).');
  const leagueKey = teamKey.split('.t.')[0];
  const gameKey = leagueKey.split('.l.')[0];
  const requestedPlayers = parsePlayers(params, fail);
  const requestedKeys = parsePlayerKeys(params, fail, gameKey);
  if (sections.includes('ownership') && !requestedPlayers.length && !requestedKeys.length) fail('invalid_players', 'Choose visible players or Yahoo player keys for ownership lookup.');
  const league = leagueInfo(entities(await query(`league/${leagueKey}`), 'league')[0] || {});
  if (league.key !== leagueKey || league.season !== Number(season)) fail('league_mismatch', 'Yahoo returned a different league or season.', 502);
  const result = { season: Number(season), teamKey, leagueKey, availability: null, trades: null, transactions: null, ownership: null, errors: {} };
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
      } else if (section === 'ownership') {
        const direct = await ownershipForKeys(requestedKeys, { query, fail, leagueKey });
        const searched = [];
        for (const request of requestedPlayers) {
          const data = await query(`league/${leagueKey}/players;search=${encodeURIComponent(request.name)};count=${SEARCH_LIMIT}`);
          const matches = collection(data, 'players', 'player', fail, leagueKey).map(playerInfo);
          const byIdentity = unique(matches);
          const match = byIdentity.get(identityKey(request));
          searched.push({ request, match: match || null, ambiguous: match === null });
        }
        const matchedKeys = [...new Set(searched.map(item => item.match?.key).filter(Boolean))];
        const searchedOwnership = await ownershipForKeys(matchedKeys, { query, fail, leagueKey });
        const matches = [
          ...requestedKeys.map(key => {
            const owned = direct.get(key);
            return owned ? { id: key, playerKey: key, name: owned.name, team: owned.team, position: owned.position, owned: owned.owned, ownershipType: owned.ownershipType, match: 'yahoo-player-key' } : { id: key, playerKey: key, owned: null, ownershipType: null, match: 'unavailable' };
          }),
          ...searched.map(({ request, match, ambiguous }) => {
            const owned = match ? searchedOwnership.get(match.key) : null;
            return { id: request.id, playerKey: match?.key || null, name: match?.name || request.name, team: match?.team || request.team, position: match?.position || request.position,
              owned: owned?.owned ?? null, ownershipType: owned?.ownershipType || null, match: owned ? 'exact-name-team-position' : ambiguous ? 'ambiguous' : 'unmatched' };
          }),
        ];
        result.ownership = { requested: requestedKeys.length + requestedPlayers.length, matched: matches.filter(item => item.owned !== null).length, matches,
          complete: matches.every(item => item.owned !== null),
          coverage: 'Bounded Yahoo league ownership lookup for the requested visible players only. Unknown means no exact unique Yahoo identity or ownership response was returned.' };
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
