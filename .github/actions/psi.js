// PageSpeed Insights APIを呼び出すためのURLを作成
const PSI_API_KEY = process.env.PSI_API_KEY;
const BASE_URL = process.env.BASE_URL;
// const htmlFilesEnv = process.env.HTML_FILES;
// const PSI_API_KEY = "AIzaSyDPYYkBQQcND0Gj38ynQ8CcSHxy18TQ9ik";
// const BASE_URL = process.env.BASE_URL || 'https://piapiapia.xsrv.jp/test/molak.jp';
const htmlFilesEnv = "product/dark_peony.html,product/dazzle_beige.html,product/dazzle_gray.html,product/dazzle_gray_toric.html,product/dollish_brown.html,product/dollish_brown_toric.html,product/dollish_gray.html,product/dream_gray.html,product/melty_mist.html,product/mirror_gray.html";

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
    } else if (score >= 50) {
        return `:orange_circle: ${score}`;
    } else {
        return `:red_circle: ${score}`;
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
 * 指定したURLに対してPageSpeed Insightsを実行し、平均スコアを計算する関数
 * @param {string} url - 分析するURL
 * @param {string} fileName - 元のファイル名（ログ用）
 * @param {number} numberOfRuns - 計測回数
 * @return {Object|null} 平均分析結果またはエラー時はnull
 */
const getScores = async (url, fileName, numberOfRuns = 3) => {
    const requestUrl = `${psiUrl}&url=${url}&strategy=mobile`;
    const results = [];

    console.log(`[${fileName}] PSI分析開始: ${url} (${numberOfRuns}回計測)`);

    for (let i = 0; i < numberOfRuns; i++) {
        try {
            const resMobile = await fetch(requestUrl);
            if (!resMobile.ok) {
                throw new Error(`API returned status ${resMobile.status} for mobile: ${await resMobile.text()}`);
            }

            const dataMobile = await resMobile.json();
            if (!dataMobile.lighthouseResult || !dataMobile.lighthouseResult.categories) {
                throw new Error('Invalid API response structure for mobile');
            }

            results.push(dataMobile.lighthouseResult.categories);
            console.log(`[${fileName}] ${i + 1}回目の計測完了`);
        } catch (error) {
            console.error(`[${fileName}] PageSpeed Insights の実行中にエラーが発生しました (${i + 1}回目): ${url}`, error);
            // エラーが発生した場合でも、処理を継続するためにnullを追加
            results.push(null);
        }
    }

    // 有効な結果のみをフィルタリング
    const validResults = results.filter(result => result !== null);

    if (validResults.length === 0) {
        console.error(`[${fileName}] 有効な結果が得られませんでした: ${url}`);
        return null;
    }

    // 平均スコアを計算
    const averageScores = {
        performance: 0,
        accessibility: 0,
        bestPractices: 0,
        seo: 0,
    };

    validResults.forEach(categories => {
        averageScores.performance += categories.performance.score;
        averageScores.accessibility += categories.accessibility.score;
        averageScores.bestPractices += categories['best-practices'].score;
        averageScores.seo += categories.seo.score;
    });

    // 平均値を計算
    const numberOfValidResults = validResults.length;
    averageScores.performance = Math.round((averageScores.performance / numberOfValidResults) * 100);
    averageScores.accessibility = Math.round((averageScores.accessibility / numberOfValidResults) * 100);
    averageScores.bestPractices = Math.round((averageScores.bestPractices / numberOfValidResults) * 100);
    averageScores.seo = Math.round((averageScores.seo / numberOfValidResults) * 100);

    // 最初の結果からIDを取得
    const mobileId = results[0]?.id;
    const report_mobile_url = mobileId ? `https://pagespeed.web.dev/report?url=${mobileId}` : null;

    return {
        url,
        fileName,
        mobile: {
            performance: averageScores.performance,
            accessibility: averageScores.accessibility,
            bestPractices: averageScores.bestPractices,
            seo: averageScores.seo,
            url: report_mobile_url,
        },
    };
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
        if (!htmlFilesEnv) {
            console.log("HTML_FILES環境変数が設定されていません");
            return "HTML files not provided.";
        }

        let htmlFiles;
        if (htmlFilesEnv.includes(',')) {
            htmlFiles = htmlFilesEnv.split(',').filter(file => file.trim());
        } else {
            htmlFiles = htmlFilesEnv.split(/\s+/).filter(file => file.trim());
        }

        if (htmlFiles.length === 0) {
            console.log("変更されたHTMLファイルはありません");
            return "No HTML files changed.";
        }

        const successfulResults = await executeRequestsInBatches(htmlFiles);

        if (successfulResults.length === 0) {
            return "No PageSpeed Insights results obtained.";
        }

        let markdown = `## PageSpeed Insights 結果 (Mobile - 平均値)\n\n`;
        markdown += `**分析日時**: ${new Date().toISOString()}\n`;
        markdown += `**分析サイト**: ${BASE_URL}\n`;
        markdown += `**分析ファイル数**: ${successfulResults.length}/${htmlFiles.length}\n\n`;
        markdown += `| Path | Performance | Accessibility | Best Practices | SEO |\n`;
        markdown += `| :-- | :--: | :--: | :--: | :--: |\n`;

        for (const result of successfulResults) {
            const path = result.fileName || getPathFromUrl(result.url) || result.url;
            markdown += `| [${path}](${result.mobile.url}) | ${scoreWithEmoji(result.mobile.performance)} | ${scoreWithEmoji(result.mobile.accessibility)} | ${scoreWithEmoji(result.mobile.bestPractices)} | ${scoreWithEmoji(result.mobile.seo)} |\n`;
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
