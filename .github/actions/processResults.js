const fs = require('fs');
const path = require('path');

/**
 * リンク切れ結果を処理してコメント本文を生成する関数
 * @returns {Object} コメント本文とリンク切れが見つかったかどうかのフラグ
 */
module.exports = async function processResults() {
  const resultsDir = './blc-results';
  let commentBody = '## 🔍 リンク切れチェック結果\n\n';
  let tableHeader = '| ファイル名 | リンク切れパス | その他情報 |\n| --- | --- | --- |\n';
  let tableContent = '';
  let brokenLinksFound = false;

  try {
    // 結果ディレクトリからファイル一覧を取得
    const files = fs.readdirSync(resultsDir);

    for (const file of files) {
      // JSONファイルのみ処理する
      if (path.extname(file) !== '.json') continue;

      const filePath = path.join(resultsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');

      // 空のファイルやJSON形式でないファイルをスキップ
      if (!content || content.trim() === '') continue;

      try {
        const results = JSON.parse(content);
        const originalFile = file.replace('.json', '');

        // 結果配列を処理
        if (results && Array.isArray(results)) {
          for (const result of results) {
            if (result.broken) {
              brokenLinksFound = true;
              const reason = result.brokenReason || 'N/A';
              tableContent += `| ${originalFile} | ${result.url.original} | ${reason} |\n`;
            }
          }
        }
      } catch (parseError) {
        console.error(`${file}の解析エラー: ${parseError.message}`);
      }
    }

    // 結果に基づいてコメント本文を作成
    if (brokenLinksFound) {
      commentBody += tableHeader + tableContent;
      commentBody += '\n\n⚠️ リンク切れが見つかりました。修正をお願いします。';
    } else {
      commentBody = '✅ リンク切れは見つかりませんでした。';
    }

    return { commentBody, brokenLinksFound };
  } catch (error) {
    console.error(`結果処理エラー: ${error.message}`);
    return {
      commentBody: '⚠️ リンク切れチェック中にエラーが発生しました。ログを確認してください。',
      brokenLinksFound: false
    };
  }
};
