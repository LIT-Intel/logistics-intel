import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      // rules-of-hooks is error globally — it catches real bugs at low cost.
      'react-hooks/rules-of-hooks': 'error',
      'react/jsx-no-target-blank': 'off',
      // Relax rules for this JS-first codebase
      'react/prop-types': 'off',
      'no-undef': 'off',
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
      'react/no-unescaped-entities': 'warn',
      'react/no-unknown-property': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  // R7 — exhaustive-deps as ERROR (not warn) for launch-critical campaign code.
  // The two P0 stale-closure bugs we found and fixed today both lived here.
  // Scoped to .jsx (TS files in features/outbound need a separate TS parser
  // setup before they can be linted — tracked as follow-up). Other directories
  // stay on warn until incrementally cleaned (~25 pre-existing app-wide).
  {
    files: [
      'src/pages/CampaignBuilder.jsx',
      'src/pages/campaigns/**/*.{js,jsx}',
      'src/features/outbound/**/*.{js,jsx}',
    ],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  // Node config files
  {
    files: ['vite.config.js', 'tailwind.config.js', 'postcss.config.js'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-undef': 'off',
    }
  }
]
