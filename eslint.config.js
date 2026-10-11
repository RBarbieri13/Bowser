import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
export default [{
 files:['src/lhq/PlayerActivity.jsx','src/lhq/playerActivity.js','src/lhq/usePlayerActivity.js','tests/player-activity.test.jsx','src/lhq/ownershipCache.js','src/lhq/useDataRefresh.js','src/lhq/playerCalendar.js','tests/ownership-cache.test.jsx','tests/player-calendar.test.jsx','src/lhq/PlayerOwnership.jsx','src/lhq/ownershipModel.js','src/lhq/usePlayerOwnership.js','tests/player-ownership.test.jsx','src/TrendBars.jsx','src/trendColumn.js','tests/trend-column.test.jsx','src/lhq/FilterPill.jsx','src/lhq/GameSelector.jsx','src/lhq/selectorStyles.js','tests/selectors.test.jsx','src/lhq/FantasyNews.jsx','src/lhq/news*.{js,jsx}','src/lhq/usePublicNews.js','src/lhq/fantasyNewsContext.js','scripts/news/*.js','tests/fantasy-news-ui.test.jsx'],
 languageOptions:{ecmaVersion:'latest',sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}},globals:{...globals.browser,...globals.node}},
 plugins:{react},rules:{...js.configs.recommended.rules,'react/jsx-uses-vars':'error','no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]},
}];
