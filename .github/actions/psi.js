// PageSpeed Insights APIを呼び出すためのURLを作成
const PSI_API_KEY = process.env.PSI_API_KEY;
const BASE_URL = process.env.BASE_URL || 'https://piapiapia.xsrv.jp/test/molak.jp'; // 環境変数から取得

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
  console.log(`[${fileName}] PSI分析開始: ${url}`);

  const requestUrl = `${psiUrl}&url=${encodeURIComponent(url)}`;
  const requestUrlForMobile = `${requestUrl}&strategy=mobile`;
  const requestUrlForDesktop = `${requestUrl}&strategy=desktop`;

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
 * メイン処理を実行する関数
 * @return {string} 結果のマークダウン文字列
 */
async function main() {
  try {
    console.log("PSI分析処理開始");

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

    console.log(`取得対象のHTMLファイル数: ${htmlFiles.length}`);
    console.log("HTML_FILES:", htmlFiles);

    if (htmlFiles.length === 0) {
      console.log("変更されたHTMLファイルはありません");
      return "No HTML files changed.";
    }

    // 同時に複数のリクエストを開始
    console.log("すべてのファイルのPSI分析を開始します");
    const promises = htmlFiles.map(file => {
      const fullUrl = `${BASE_URL}/${file.trim()}`;
      return getScores(fullUrl, file.trim());
    });

    // 結果を待つ
    const results = await Promise.allSettled(promises);
    console.log(`${results.length}件のリクエスト完了`);

    // 成功した結果のみを抽出
    const successfulResults = results
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => result.value);

    // 失敗した数を計算
    const failedCount = results.length - successfulResults.length;
    if (failedCount > 0) {
      console.log(`${failedCount}件のリクエストが失敗しました`);
    }

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
