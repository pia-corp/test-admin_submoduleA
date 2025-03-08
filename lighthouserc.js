module.exports = {
  ci: {
    collect: {
      // 静的ビルドされたアプリケーションをテストするための設定
      staticDistDir: './public', // あなたのビルドディレクトリに合わせて変更してください
      // または動的サーバーをテストするためのURL設定
      // startServerCommand: 'npm run start', // 開発サーバーを起動するコマンド
      // url: ['http://localhost:3000', 'http://localhost:3000/about'], // テストするURL
      numberOfRuns: 1, // 各ページで実行するLighthouseの回数
    },
    upload: {
      target: 'temporary-public-storage', // 結果の保存先（GitHub上でもアクセス可能）
    },
    assert: {
      // アサーション設定 - これらはオプションです
      // 必要に応じてパフォーマンス閾値を設定できます
      preset: 'lighthouse:recommended',
      assertions: {
        'categories:performance': ['warn', {minScore: 0.6}],
        'categories:accessibility': ['warn', {minScore: 0.8}],
        'categories:best-practices': ['warn', {minScore: 0.8}],
        'categories:seo': ['warn', {minScore: 0.8}],
      },
    },
  },
};
