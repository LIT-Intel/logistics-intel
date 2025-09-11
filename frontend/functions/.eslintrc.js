/* eslint-env node */
module.exports = {
  root: true,
  env: { node: true, es2021: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'script' },
  // Silence require/exports/module complaints in CJS
  rules: { 'no-undef': 'off' },
  ignorePatterns: ['node_modules/', 'lib/', 'dist/', '.eslintrc.js'],
};
