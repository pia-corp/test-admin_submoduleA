const fs = require('fs');
const path = require('path');
const glob = require('glob');

/**
 * リンク切れ結果を処理してコメント本文を生成する関数
 * @returns {Object} commentBody: コメント本文, brokenLinksFound: リンク切れが見つかったかどうかのフラグ
 */
module.exports = async function processResults() {
  const resultsDir = './blc-results';

  try {
    // 結果ファイルが存在するか確認
    if (!fs.existsSync(resultsDir)) {
      console.error('結果ディレクトリが見つかりません:', resultsDir);
      return {
        commentBody: '⚠️ リンク切れチェックの結果ディレクトリが見つかりません。',
        brokenLinksFound: false
      };
    }

    // 結果の集計
    const brokenLinks = collectBrokenLinks(resultsDir);

    // コメント本文の生成
    return formatComment(brokenLinks);
  } catch (error) {
    console.error(`結果処理エラー: ${error.message}`);
    return {
      commentBody: `⚠️ リンク切れチェック中にエラーが発生しました: ${error.message}`,
      brokenLinksFound: false
    };
  }
};

/**
 * 結果ディレクトリから壊れたリンクを収集する
 * @param {string} resultsDir - 結果ディレクトリのパス
 * @returns {Array} 壊れたリンクの配列
 */
function collectBrokenLinks(resultsDir) {
  console.log("resultsDir" + resultsDir);
  const brokenLinks = [];

  // JSONファイルを検索
  const jsonFiles = glob.sync(path.join(resultsDir, '*.json'));

  for (const filePath of jsonFiles) {
    const fileName = path.basename(filePath, '.json');

    try {
      const content = fs.readFileSync(filePath, 'utf8');

      // 空のファイルをスキップ
      if (!content || content.trim() === '') continue;

      const results = JSON.parse(content);

      // 結果が配列であることを確認
      if (Array.isArray(results)) {
        for (const item of results) {
          if (item.broken) {
            brokenLinks.push({
              file: fileName,
              url: item.url.original,
              reason: item.brokenReason || '不明',
              parentUrl: item.base.original
            });
          }
        }
      }
    } catch (error) {
      console.error(`${fileName}の処理中にエラーが発生しました: ${error.message}`);
    }
  }

  return brokenLinks;
}

/**
 * 壊れたリンクからコメント本文を生成する
 * @param {Array} brokenLinks - 壊れたリンクの配列
 * @returns {Object} コメント本文とリンク切れが見つかったかどうかのフラグ
 */
function formatComment(brokenLinks) {
  if (brokenLinks.length === 0) {
    return {
      commentBody: '## 🔍 リンク切れチェック結果\n\n✅ リンク切れは見つかりませんでした。',
      brokenLinksFound: false
    };
  }

  let commentBody = '## 🔍 リンク切れチェック結果\n\n';
  commentBody += '| ファイル名 | リンク切れパス | その他情報 |\n';
  commentBody += '| --- | --- | --- |\n';

  for (const link of brokenLinks) {
    commentBody += `| ${link.file} | ${link.url} | ${link.reason} |\n`;
  }

  commentBody += `\n\n⚠️ **${brokenLinks.length}個**のリンク切れが見つかりました。修正をお願いします。`;

  return {
    commentBody,
    brokenLinksFound: true
  };
}
