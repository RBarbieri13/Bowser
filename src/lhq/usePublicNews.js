import {useEffect,useRef,useState} from 'react';
const clean = value => typeof value === 'string' ? value : '';
export function usePublicNews(hours, refresh, autoRead) {
  const url = `/api/v1/fantasy-news?hours=${hours}&limit=100`;
  const [result, setResult] = useState({ url: '', data: null, loading: true, error: '', readAt: null });
  const [poll, setPoll] = useState(0);
  const revision = useRef(0);
  useEffect(() => {
    if (!autoRead) return;
    const timer = window.setInterval(() => setPoll(value => value + 1), 60000);
    return () => window.clearInterval(timer);
  }, [autoRead]);
  useEffect(() => {
    const id = ++revision.current;
    const controller = new AbortController();
    setResult(previous => ({ url, data: previous.url === url ? previous.data : null, loading: true, error: '', readAt: previous.url === url ? previous.readAt : null }));
    fetch(url, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(clean(data?.error?.message) || 'The news feed could not be read.');
      if (!data || !Array.isArray(data.articles) || !data.meta || data.meta.scope !== 'public_nfl_news') throw new Error('The news feed returned an unexpected response.');
      const ids = new Set();
      const articles = data.articles.filter(article => article && clean(article.id) && clean(article.headline) && !ids.has(article.id) && ids.add(article.id));
      if (!controller.signal.aborted && id === revision.current) setResult({ url, data: { meta: data.meta, articles }, loading: false, error: '', readAt: new Date().toISOString() });
    }).catch(error => {
      if (!controller.signal.aborted && id === revision.current) setResult(previous => ({ ...previous, data: previous.data ? { ...previous.data, meta: { ...previous.data.meta, state: 'stale', message: 'Feed read failed. Last successful snapshot retained; current freshness is unverified.' }, articles: previous.data.articles.map(article => ({ ...article, freshness: { ...article.freshness, state: 'stale' } })) } : null, loading: false, error: error.message || 'The news feed could not be read.' }));
    });
    return () => controller.abort();
  }, [url, refresh, poll]);
  return result.url === url ? result : { url, data: null, loading: true, error: '', readAt: null };
}

