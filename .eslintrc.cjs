module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true
  },
  extends: ['standard'],
  parserOptions: {
    sourceType: 'module'
  },
  rules: {
    'no-console': 'off',
    'comma-dangle': ['error', 'never'],
    semi: ['error', 'always']
  },
  ignorePatterns: [
    'dist',
    'node_modules'
  ]
};

