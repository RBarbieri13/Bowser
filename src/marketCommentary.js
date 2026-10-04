export const TOPICS = { injury: 'Injury', role: 'Role / depth', usage: 'Usage / performance', waiver: 'Waivers', irrelevant: 'Irrelevant', uncertain: 'Uncertain' };
export const CONFIDENCE_MIN = 0.7;
export function topicOf(record) {
  const answer = record.answers?.topic;
  return answer?.confidence >= CONFIDENCE_MIN && TOPICS[answer.choice] ? answer.choice : 'uncertain';
}
export function sentimentOf(record) {
  const answer = record.answers?.sentiment;
  return record.answers?.relevance?.noul >= CONFIDENCE_MIN && answer?.confidence >= CONFIDENCE_MIN && ['positive', 'neutral', 'negative'].includes(answer.choice) ? answer.choice : 'unclear';
}
function summarize(records) {
  const counts = { positive: 0, neutral: 0, negative: 0, unclear: 0 };
  records.forEach(r => counts[sentimentOf(r)]++);
  const accepted = records.filter(r => sentimentOf(r) !== 'unclear');
  return { ...counts, accepted: accepted.length,
    balance: accepted.length ? (counts.positive - counts.negative) / accepted.length * 100 : null,
    confidence: accepted.length ? accepted.reduce((sum, r) => sum + r.answers.sentiment.confidence, 0) / accepted.length * 100 : null };
}
export function addCommentary(rows, snapshot, { hours = 72, topic = 'all', now = Date.now() } = {}) {
  const cutoff = now - hours * 3600000;
  const topics = Array.isArray(topic) ? topic : topic === 'all' ? [] : [topic];
  const byPlayer = new Map();
  // The newest classification of an article/player replaces the earlier one; it is not a second mention.
  for (const record of new Map((snapshot.records || []).map(r => [r.id, r])).values()) {
    const at = Date.parse(record.publishedAt);
    if (!Number.isFinite(at) || at > now || at < cutoff - hours * 3600000 || (topics.length > 0 && !topics.includes(topicOf(record)))) continue;
    byPlayer.set(record.espnId, [...(byPlayer.get(record.espnId) || []), record]);
  }
  return rows.map(row => {
    // No fuzzy cross-team match. Only the ESPN identity established by Market Pulse.
    const all = byPlayer.get(row.espnId) || [];
    const current = all.filter(r => Date.parse(r.publishedAt) >= cutoff).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const prior = summarize(all.filter(r => Date.parse(r.publishedAt) < cutoff));
    const summary = summarize(current);
    return { ...row, newsCount: current.length || null, newsTopic: current.length ? TOPICS[topicOf(current[0])] : null,
      positive: current.length ? summary.positive : null, neutral: current.length ? summary.neutral : null,
      negative: current.length ? summary.negative : null, unclear: current.length ? summary.unclear : null,
      newsConfidence: summary.confidence, newsBalance: summary.balance,
      newsDelta: summary.accepted >= 2 && prior.accepted >= 2 ? summary.balance - prior.balance : null,
      newsSources: current.length ? new Set(current.map(r => r.source)).size : null,
      news: current, previousNewsCount: prior.accepted,
    };
  });
}
