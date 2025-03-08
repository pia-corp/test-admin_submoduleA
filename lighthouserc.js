module.exports = {
  ci: {
    collect: {
      staticDistDir: './public', // あなたのビルドディレクトリに合わせて変更してください
      startServerCommand: 'rails server -e production',
      numberOfRuns: 1, // 各ページで実行するLighthouseの回数
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
