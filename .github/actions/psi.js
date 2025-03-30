// PageSpeed Insights APIを呼び出すためのURLを作成
const PSI_API_KEY = process.env.PSI_API_KEY;
const BASE_URL = process.env.BASE_URL;
const HTML_FILES_ENV = process.env.HTML_FILES;

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
 * 指定したURLに対してPageSpeed Insightsを実行し、平均スコアを計算する関数
 * @param {string} url - 分析するURL
 * @param {string} fileName - 元のファイル名（ログ用）
 * @return {Object|null} 平均分析結果またはエラー時はnull
 */
const getScores = async (url, fileName) => {
  const requestUrl = `${PSI_URL}&url=${url}&strategy=mobile`;
  let totalScores = {
    performance: 0,
    accessibility: 0,
    bestPractices: 0,
    seo: 0,
  };
  let validResultCount = 0;

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
    totalScores.performance += categories.performance.score;
    totalScores.accessibility += categories.accessibility.score;
    totalScores.bestPractices += categories['best-practices'].score;
    totalScores.seo += categories.seo.score;
    validResultCount++;

    // console.log(`[${fileName}] ${i + 1}回目の計測完了`);
  } catch (error) {
    console.error(
      `[${fileName}] PageSpeed Insights の実行中にエラーが発生しました (${
        i + 1
      }回目): ${url}`,
      error
    );
  }

  if (validResultCount === 0) {
    console.error(`[${fileName}] 有効な結果が得られませんでした: ${url}`);
    return null;
  }

  // 平均値を計算
  const averageScores = {
    performance: Math.round(
      (totalScores.performance / validResultCount) * 100
    ),
    accessibility: Math.round(
      (totalScores.accessibility / validResultCount) * 100
    ),
    bestPractices: Math.round(
      (totalScores.bestPractices / validResultCount) * 100
    ),
    seo: Math.round((totalScores.seo / validResultCount) * 100),
  };

  return {
    url,
    fileName,
    mobile: {
      performance: averageScores.performance,
      accessibility: averageScores.accessibility,
      bestPractices: averageScores.bestPractices,
      seo: averageScores.seo,
      url: `https://pagespeed.web.dev/report?url=${url}`, // dataMobile.id は存在しないため url を使用
    },
  };
};

/**
 * リクエストを1秒ごとに並列処理し、結果を待たずに次のAPI通信を実行する関数
 * @param {Array<string>} files - ファイル名の配列
 * @return {Promise<Array<Object>>} 成功した結果の配列
 */
async function executeRequestsInBatches(files) {
  let results = [];
  let failedCount = 0;

  for (const file of files) {
    const fullUrl = `${BASE_URL}/${file.trim()}`;

    try {
      const result = await getScores(fullUrl, file.trim());
      if (result) {
        results.push(result);
      } else {
        failedCount++;
      }
    } catch (error) {
      console.error(`[エラー] ${file.trim()}: ${error}`);
      failedCount++;
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
  let markdown = '## PageSpeed Insights 結果 (Mobile - 平均値)\n\n';
  markdown += `**分析日時**: ${new Date().toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
  })}\n`;
  markdown += `**分析サイト**: ${BASE_URL}/\n`;
  markdown += `**分析ファイル数**: ${results.length}/${htmlFiles.length}\n\n`;
  markdown +=
    '| Path | Performance | Accessibility | Best Practices | SEO |\n';
  markdown += '| :-- | :--: | :--: | :--: | :--: |\n';

  for (const result of results) {
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
 * @return {string} 結果のマークダウン文字列
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

    const successfulResults = await executeRequestsInBatches(htmlFiles);

    if (successfulResults.length === 0) {
      return 'No PageSpeed Insights results obtained.';
    }

    const markdown = generateMarkdown(successfulResults, htmlFiles);

    // console.log("マークダウンレポート生成完了");
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
