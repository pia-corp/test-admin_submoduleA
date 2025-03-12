// PageSpeed Insights APIを呼び出すためのURLを作成
// const PSI_API_KEY = "AIzaSyDPYYkBQQcND0Gj38ynQ8CcSHxy18TQ9ik";
const PSI_API_KEY = process.env.PSI_API_KEY;
const BASE_URL = process.env.BASE_URL;
// const BASE_URL = process.env.BASE_URL || 'https://piapiapia.xsrv.jp/test/molak.jp';
// const htmlFilesEnv = "product/dark_peony.html,product/dazzle_beige.html,product/dazzle_gray.html,product/dazzle_gray_toric.html,product/dollish_brown.html,product/dollish_brown_toric.html,product/dollish_gray.html,product/dream_gray.html,product/melty_mist.html,product/mirror_gray.html";

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
 * @param {string} fileName - 元のファイル名（ログ用）
 * @return {Object|null} 分析結果またはエラー時はnull
 */
const getScores = async (url, fileName) => {
  // console.log(`[${fileName}] PSI分析開始: ${url}`);

  const requestUrl = `${psiUrl}&url=${encodeURIComponent(url)}`;
  const requestUrlForMobile = `${requestUrl}&strategy=mobile`;
  const requestUrlForDesktop = `${requestUrl}&strategy=desktop`;

  console.log(requestUrlForMobile);

  try {
    // 同時に両方のリクエストを開始
    const [mobilePromise, desktopPromise] = [
      fetch(requestUrlForMobile),
      fetch(requestUrlForDesktop)
    ];

    console.log(`[${fileName}] モバイルとデスクトップのリクエスト開始`);

    // モバイル版の結果を取得
    const resMobile = await mobilePromise;
    if (!resMobile.ok) {
      throw new Error(`API returned status ${resMobile.status} for mobile: ${await resMobile.text()}`);
    }

    const dataMobile = await resMobile.json();
    if (!dataMobile.lighthouseResult || !dataMobile.lighthouseResult.categories) {
      throw new Error('Invalid API response structure for mobile');
    }

    console.log(`[${fileName}] モバイル結果取得完了`);

    // デスクトップ版の結果を取得
    const resDesktop = await desktopPromise;
    if (!resDesktop.ok) {
      throw new Error(`API returned status ${resDesktop.status} for desktop: ${await resDesktop.text()}`);
    }

    const dataDesktop = await resDesktop.json();
    if (!dataDesktop.lighthouseResult || !dataDesktop.lighthouseResult.categories) {
      throw new Error('Invalid API response structure for desktop');
    }

    console.log(`[${fileName}] デスクトップ結果取得完了`);

    // スコアを計算
    const { categories } = dataMobile.lighthouseResult;
    const { categories: categoriesDesktop } = dataDesktop.lighthouseResult;

    return {
      url,
      fileName,
      mobile: {
        performance: Math.round(categories.performance.score * 100),
        accessibility: Math.round(categories.accessibility.score * 100),
        bestPractices: Math.round(categories['best-practices'].score * 100),
        seo: Math.round(categories.seo.score * 100),
      },
      desktop: {
        performance: Math.round(categoriesDesktop.performance.score * 100),
        accessibility: Math.round(categoriesDesktop.accessibility.score * 100),
        bestPractices: Math.round(categoriesDesktop['best-practices'].score * 100),
        seo: Math.round(categoriesDesktop.seo.score * 100),
      },
    };
  } catch (error) {
    console.error(`[${fileName}] PageSpeed Insights の実行中にエラーが発生しました: ${url}`, error);
    return null;
  }
};

/**
 * リクエストをバッチ処理する関数
 * @param {Array<string>} files - ファイル名の配列
 * @return {Array<Object>} 成功した結果の配列
 */
async function executeRequestsInBatches(files) {
  const batchSize = 5;
  let allResults = [];
  let failedCount = 0;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const promises = batch.map(file => {
      const fullUrl = `${BASE_URL}/${file.trim()}`;
      return getScores(fullUrl, file.trim());
    });

    const results = await Promise.allSettled(promises);
    console.log(`${i + batch.length}件のリクエスト完了`);

    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value !== null) {
        allResults.push(result.value);
      } else {
        failedCount++;
      }
    });
  }

  if (failedCount > 0) {
    console.log(`${failedCount}件のリクエストが失敗しました`);
  }

  return allResults;
}

/**
 * メイン処理を実行する関数
 * @return {string} 結果のマークダウン文字列
 */
async function main() {
  try {
    // console.log("PSI分析処理開始");

    // 環境変数からHTMLファイルのリストを取得
    const htmlFilesEnv = process.env.HTML_FILES;

    if (!htmlFilesEnv) {
      console.log("HTML_FILES環境変数が設定されていません");
      return "HTML files not provided.";
    }

    // 環境変数の形式を検出して適切に分割
    // カンマ区切りの場合とスペース区切りの場合の両方に対応
    let htmlFiles;
    if (htmlFilesEnv.includes(',')) {
      htmlFiles = htmlFilesEnv.split(',').filter(file => file.trim());
    } else {
      htmlFiles = htmlFilesEnv.split(/\s+/).filter(file => file.trim());
    }

    // console.log(`取得対象のHTMLファイル数: ${htmlFiles.length}`);
    // console.log("HTML_FILES:", htmlFiles);

    if (htmlFiles.length === 0) {
      console.log("変更されたHTMLファイルはありません");
      return "No HTML files changed.";
    }

    // console.log("すべてのファイルのPSI分析を開始します\n");
    const successfulResults = await executeRequestsInBatches(htmlFiles);

    if (successfulResults.length === 0) {
      return "No PageSpeed Insights results obtained.";
    }

    // 結果をマークダウン形式で出力
    let markdown = `## PageSpeed Insights 結果\n\n`;
    markdown += `**分析日時**: ${new Date().toISOString()}\n`;
    markdown += `**分析サイト**: ${BASE_URL}\n`;
    markdown += `**分析ファイル数**: ${successfulResults.length}/${htmlFiles.length}\n\n`;

    for (const result of successfulResults) {
      const path = result.fileName || getPathFromUrl(result.url) || result.url;
      markdown += `
### ${path}

| Device | Performance | Accessibility | Best Practices | SEO |
| :-- | :--: | :--: | :--: | :--: |
| Mobile  | ${scoreWithEmoji(result.mobile.performance)} | ${scoreWithEmoji(result.mobile.accessibility)} | ${scoreWithEmoji(result.mobile.bestPractices)} | ${scoreWithEmoji(result.mobile.seo)} |
| Desktop | ${scoreWithEmoji(result.desktop.performance)} | ${scoreWithEmoji(result.desktop.accessibility)} | ${scoreWithEmoji(result.desktop.bestPractices)} | ${scoreWithEmoji(result.desktop.seo)} |
`;
    }

    console.log("マークダウンレポート生成完了");
    return markdown;
  } catch (err) {
    console.error("予期しないエラーが発生しました:", err);
    return `Error occurred: ${err.message}`;
  }
}

// メイン処理を実行
main().then(result => {
  // GitHub Actions用に出力
  process.stdout.write(result);
  process.exit(0);
}).catch(error => {
  console.error(error);
  process.exit(1);
});
