import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
export default [{
 files:['src/lhq/FantasyNews.jsx','src/lhq/news*.{js,jsx}','src/lhq/usePublicNews.js','src/lhq/fantasyNewsContext.js','scripts/news/*.js','tests/fantasy-news-ui.test.jsx'],
 languageOptions:{ecmaVersion:'latest',sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}},globals:{...globals.browser,...globals.node}},
 plugins:{react},rules:{...js.configs.recommended.rules,'react/jsx-uses-vars':'error','no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]},
}];
