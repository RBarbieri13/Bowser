import commentary from '../data/market-commentary.json';
import news from '../data/market-news.json';
import {mergeMarketNews} from './marketCommentary.js';
export default mergeMarketNews(commentary,news);
