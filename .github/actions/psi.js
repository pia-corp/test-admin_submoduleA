// PageSpeed Insights APIを呼び出すためのURLを作成
const PSI_API_KEY = process.env.PSI_API_KEY;
const BASE_URL = process.env.BASE_URL;
const HTML_FILES_ENV = process.env.HTML_FILES;
const CONCURRENT_LIMIT = 10; // 同時に実行する最大リクエスト数

if (!PSI_API_KEY) {
  console.error('PSI_API_KEY環境変数が設定されていません');
  process.exit(1);
}

const PSI_URL = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?key=${PSI_API_KEY}&category=performance&category=accessibility&category=best-practices&category=seo&strategy=mobile&ts=${Date.now()}`;

/**
 * スコアに基づいて絵文字を付与する関数
 * @param {number} score - PageSpeed Insightsのスコア
 * @return {string} 絵文字付きのスコア文字列
 */
const scoreWithEmoji = (score) => {
  if (score >= 90) {
    return ':green_circle: ' + score;
  } else if (score >= 50) {
    return ':orange_circle: ' + score;
  } else {
    return ':red_circle: ' + score;
  }
};

/**
 * URLからパスを抽出する関数
 * @param {string} url - 解析するURL
 * @return {string|null} パス部分または無効なURLの場合はnull
 */
function getPathFromUrl(url) {
  try {
    const urlObject = new URL(url);
    return urlObject.pathname + urlObject.search + urlObject.hash;
  } catch (error) {
    console.error('無効なURLです:', error);
    return null;
  }
}

/**
 * 指定したURLに対してPageSpeed Insightsを実行する関数
 * @param {string} url - 分析するURL
 * @param {string} fileName - 元のファイル名（ログ用）
 * @return {Promise<Object|null>} 分析結果またはエラー時はnull
 */
const getScores = async (url, fileName) => {
  const requestUrl = `${PSI_URL}&url=${url}&strategy=mobile`;

  try {
    const resMobile = await fetch(requestUrl);

    if (!resMobile.ok) {
      const errorText = await resMobile.text();
      throw new Error(
        `API returned status ${resMobile.status} for mobile: ${errorText}`
      );
    }

    const dataMobile = await resMobile.json();
    if (!dataMobile.lighthouseResult || !dataMobile.lighthouseResult.categories) {
      throw new Error('Invalid API response structure for mobile');
    }

    const categories = dataMobile.lighthouseResult.categories;
    const scores = {
      performance: Math.round(categories.performance.score * 100),
      accessibility: Math.round(categories.accessibility.score * 100),
      bestPractices: Math.round(categories['best-practices'].score * 100),
      seo: Math.round(categories.seo.score * 100)
    };

    return {
      url,
      fileName,
      mobile: {
        performance: scores.performance,
        accessibility: scores.accessibility,
        bestPractices: scores.bestPractices,
        seo: scores.seo,
        url: `https://pagespeed.web.dev/report?url=${url}`
      }
    };
  } catch (error) {
    console.error(
      `[${fileName}] PageSpeed Insights の実行中にエラーが発生しました: ${url}`,
      error
    );
    return null;
  }
};

/**
 * 非同期にリクエストを処理し、同時実行数を制限する関数
 * @param {Array<string>} files - ファイル名の配列
 * @param {number} concurrentLimit - 同時実行する最大リクエスト数
 * @return {Promise<Array<Object>>} 成功した結果の配列
 */
async function executeRequestsConcurrently(files, concurrentLimit = CONCURRENT_LIMIT) {
  let results = [];
  let failedCount = 0;

  // 同時実行数を制限するための関数
  async function processBatch(batch) {
    const batchPromises = batch.map(file => {
      const fullUrl = `${BASE_URL}/${file.trim()}`;
      return getScores(fullUrl, file.trim())
        .then(result => {
          if (result) {
            results.push(result);
          } else {
            failedCount++;
          }
        })
        .catch(error => {
          console.error(`[エラー] ${file.trim()}: ${error}`);
          failedCount++;
        });
    });

    await Promise.all(batchPromises);
  }

  // ファイルリストをバッチに分割して処理
  for (let i = 0; i < files.length; i += concurrentLimit) {
    const batch = files.slice(i, i + concurrentLimit);
    await processBatch(batch);

    // APIレート制限を考慮して少し待つ（オプション）
    if (i + concurrentLimit < files.length) {
      // console.log(`バッチ処理完了: ${i + concurrentLimit}/${files.length}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (failedCount > 0) {
    console.log(`${failedCount}件のリクエストが失敗しました`);
  }

  return results;
}

/**
 * マークダウン形式の結果を生成する関数
 * @param {Array<Object>} results - 分析結果の配列
 * @param {Array<string>} htmlFiles - 分析対象のHTMLファイルの配列
 * @return {string} マークダウン文字列
 */
function generateMarkdown(results, htmlFiles) {
  let markdown = '## PageSpeed Insights 結果 (Mobile)\n\n';
  markdown += `**分析日時**: ${new Date().toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
  })}\n`;
  markdown += `**分析サイト**: ${BASE_URL}/\n`;
  markdown += `**分析ファイル数**: ${results.length}/${htmlFiles.length}\n\n`;
  markdown +=
    '| Path | Performance | Accessibility | Best Practices | SEO |\n';
  markdown += '| :-- | :--: | :--: | :--: | :--: |\n';

  // 結果をパスでソート
  const sortedResults = [...results].sort((a, b) => {
    const pathA = a.fileName || getPathFromUrl(a.url) || a.url;
    const pathB = b.fileName || getPathFromUrl(b.url) || b.url;
    return pathA.localeCompare(pathB);
  });

  for (const result of sortedResults) {
    const path = result.fileName || getPathFromUrl(result.url) || result.url;
    markdown += `| [${path}](${result.mobile.url}) | ${scoreWithEmoji(
      result.mobile.performance
    )} | ${scoreWithEmoji(result.mobile.accessibility)} | ${scoreWithEmoji(
      result.mobile.bestPractices
    )} | ${scoreWithEmoji(result.mobile.seo)} |\n`;
  }

  return markdown;
}

/**
 * メイン処理を実行する関数
 * @return {Promise<string>} 結果のマークダウン文字列
 */
async function main() {
  try {
    if (!HTML_FILES_ENV) {
      console.log('HTML_FILES環境変数が設定されていません');
      return 'HTML files not provided.';
    }

    let htmlFiles = HTML_FILES_ENV.split(/,\s*|\s+/).filter((file) => file.trim() !== '');

    if (htmlFiles.length === 0) {
      console.log('変更されたHTMLファイルはありません');
      return 'No HTML files changed.';
    }

    // 並列処理で実行
    const successfulResults = await executeRequestsConcurrently(htmlFiles);

    if (successfulResults.length === 0) {
      return 'No PageSpeed Insights results obtained.';
    }

    const markdown = generateMarkdown(successfulResults, htmlFiles);

    return markdown;
  } catch (err) {
    console.error('予期しないエラーが発生しました:', err);
    return `Error occurred: ${err.message}`;
  }
}

// メイン処理を実行
main()
  .then((result) => {
    // GitHub Actions用に出力
    process.stdout.write(result);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
