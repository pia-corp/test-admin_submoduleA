// PageSpeed Insights APIを呼び出すためのURLを作成
// const PSI_API_KEY = process.env.PSI_API_KEY;
const PSI_API_KEY = "AIzaSyDPYYkBQQcND0Gj38ynQ8CcSHxy18TQ9ik";
const BASE_URL = process.env.BASE_URL || 'https://piapiapia.xsrv.jp/test/clainel.jp'; // 環境変数から取得

if (!PSI_API_KEY) {
  console.error('PSI_API_KEY環境変数が設定されていません');
  process.exit(1);
}

const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?key=${PSI_API_KEY}&category=performance&category=accessibility&category=best-practices&category=seo`;

/**
 * スコアに基づいて絵文字を付与する関数
 * @param {number} score - PageSpeed Insightsのスコア
 * @return {string} 絵文字付きのスコア文字列
 */
const scoreWithEmoji = (score) => {
  if (score >= 90) {
    return `:green_circle: ${score}`;
  } else if (score >= 70) {
    return `:orange_circle: ${score}`;
  } else if (score >= 50) {
    return `:red_circle: ${score}`;
  } else {
    return `:warning: ${score}`;
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
    console.error("無効なURLです:", error);
    return null;
  }
}

/**
 * 指定したURLに対してPageSpeed Insightsを実行する関数
 * @param {string} url - 分析するURL
 * @return {Object|null} 分析結果またはエラー時はnull
 */
const getScores = async (url) => {
  const requestUrl = `${psiUrl}&url=${encodeURIComponent(url)}`;
  const requestUrlForMobile = `${requestUrl}&strategy=mobile`;
  const requestUrlForDesktop = `${requestUrl}&strategy=desktop`;

  try {
    // モバイル版の結果を取得
    const resMobile = await fetch(requestUrlForMobile);

    if (!resMobile.ok) {
      throw new Error(`API returned status ${resMobile.status} for mobile: ${await resMobile.text()}`);
    }

    const dataMobile = await resMobile.json();

    if (!dataMobile.lighthouseResult || !dataMobile.lighthouseResult.categories) {
      throw new Error('Invalid API response structure for mobile');
    }

    const { categories } = dataMobile.lighthouseResult;
    const performanceScoreMobile = Math.round(categories.performance.score * 100);
    const accessibilityScoreMobile = Math.round(categories.accessibility.score * 100);
    const bestPracticesScoreMobile = Math.round(categories['best-practices'].score * 100);
    const seoScoreMobile = Math.round(categories.seo.score * 100);

    // デスクトップ版の結果を取得
    const resDesktop = await fetch(requestUrlForDesktop);

    if (!resDesktop.ok) {
      throw new Error(`API returned status ${resDesktop.status} for desktop: ${await resDesktop.text()}`);
    }

    const dataDesktop = await resDesktop.json();

    if (!dataDesktop.lighthouseResult || !dataDesktop.lighthouseResult.categories) {
      throw new Error('Invalid API response structure for desktop');
    }

    const { categories: categoriesDesktop } = dataDesktop.lighthouseResult;
    const performanceScoreDesktop = Math.round(categoriesDesktop.performance.score * 100);
    const accessibilityScoreDesktop = Math.round(categoriesDesktop.accessibility.score * 100);
    const bestPracticesScoreDesktop = Math.round(categoriesDesktop['best-practices'].score * 100);
    const seoScoreDesktop = Math.round(categoriesDesktop.seo.score * 100);

    return {
      url,
      mobile: {
        performance: performanceScoreMobile,
        accessibility: accessibilityScoreMobile,
        bestPractices: bestPracticesScoreMobile,
        seo: seoScoreMobile,
      },
      desktop: {
        performance: performanceScoreDesktop,
        accessibility: accessibilityScoreDesktop,
        bestPractices: bestPracticesScoreDesktop,
        seo: seoScoreDesktop,
      },
    };
  } catch (error) {
    console.error(`PageSpeed Insights の実行中にエラーが発生しました: ${url}`, error);
    return null;
  }
};

/**
 * スコア取得を再試行する関数
 * @param {string} url - 分析するURL
 * @param {number} maxRetries - 最大リトライ回数
 * @return {Object|null} 分析結果またはエラー時はnull
 */
const getScoresWithRetry = async (url, maxRetries = 3) => {
  let attempt = 0;
  let result = null;

  while (attempt < maxRetries) {
    result = await getScores(url);

    if (!result) {
      console.log(`Attempt ${attempt + 1}: Failed to get results for ${url}, retrying...`);
    } else {
      const hasZeroScore = Object.values(result.mobile).concat(Object.values(result.desktop)).some(score => score === 0);

      if (!hasZeroScore) {
        return result;
      }

      console.log(`Attempt ${attempt + 1}: ${url} has a score of 0, retrying...`);
    }

    attempt++;
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5秒待機
    }
  }

  console.log(`Max retries reached for ${url}. Skipping...`);
  return result;
};

/**
 * メイン処理を実行する関数
 * @return {string} 結果のマークダウン文字列
 */
async function main() {
  try {
    // 環境変数からHTMLファイルのリストを取得
    // const htmlFilesEnv = process.env.HTML_FILES;
    const htmlFilesEnv = 'company.html,index.html,';

    if (!htmlFilesEnv) {
      console.log("HTML_FILES環境変数が設定されていません");
      return "HTML files not provided.";
    }

    const htmlFiles = htmlFilesEnv.split(',').filter(file => file.trim());
    console.log("HTML_FILES:", htmlFiles);

    if (htmlFiles.length === 0) {
      console.log("変更されたHTMLファイルはありません");
      return "No HTML files changed.";
    }

    const results = [];
    for (const file of htmlFiles) {
      const fullUrl = `${BASE_URL}/${file.trim()}`;
      console.log(`Analyzing file: ${fullUrl}`);

      const result = await getScoresWithRetry(fullUrl, 3);
      if (result) {
        results.push(result);
      } else {
        console.log(`Failed to get valid results for ${fullUrl} after retries.`);
      }
    }

    if (results.length === 0) {
      return "No PageSpeed Insights results obtained.";
    }

    // 結果をマークダウン形式で出力
    let markdown = ``;
    for (const result of results) {
      const path = getPathFromUrl(result.url) || result.url;
      markdown += `
### ${path}

| Device | Performance | Accessibility | Best Practices | SEO |
| :-- | :--: | :--: | :--: | :--: |
| Mobile  | ${scoreWithEmoji(result.mobile.performance)} | ${scoreWithEmoji(result.mobile.accessibility)} | ${scoreWithEmoji(result.mobile.bestPractices)} | ${scoreWithEmoji(result.mobile.seo)} |
| Desktop | ${scoreWithEmoji(result.desktop.performance)} | ${scoreWithEmoji(result.desktop.accessibility)} | ${scoreWithEmoji(result.desktop.bestPractices)} | ${scoreWithEmoji(result.desktop.seo)} |
`;
    }

    console.log(markdown);
    return markdown;
  } catch (err) {
    console.error("予期しないエラーが発生しました:", err);
    return `Error occurred: ${err.message}`;
  }
}

// メイン処理を実行
main().then(result => {
  // GitHub Actions用に出力
  console.log(result);
  process.exit(0);
}).catch(error => {
  console.error(error);
  process.exit(1);
});
