module.exports = {
  languageOptions: {
    globals: {
      window: true,
      document: true,
      global: true,
      process: true,
    },
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {},
};
