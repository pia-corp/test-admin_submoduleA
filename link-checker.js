const { SiteChecker } = require("broken-link-checker");
const fs = require('fs').promises;
const fsSync = require('fs'); // 一部の操作は同期処理のままにする
const path = require('path');
const cheerio = require('cheerio');
const repositoryName = process.env.REPOSITORY_NAME || "localhost:8081"; // 環境変数から取得

// デバッグ用のタイムスタンプ付きロガー
const debug = {
  log: (message, ...args) => {
    const timestamp = new Date().toISOString();
    console.log(`[DEBUG ${timestamp}] ${message}`, ...args);
  },
  error: (message, ...args) => {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR ${timestamp}] ${message}`, ...args);
  },
  info: (message, ...args) => {
    const timestamp = new Date().toISOString();
    console.info(`[INFO ${timestamp}] ${message}`, ...args);
  }
};

const publicDir = path.join(__dirname, 'public/');

// リンク制限カウンター
let totalBrokenLinksCount = 0;
const BROKEN_LINKS_LIMIT = 101;

// ファイル探索を非同期に変更
async function getHtmlFiles(dir) {
  // debug.log(`ディレクトリ探索開始: ${dir}`);
  let htmlFiles = [];
  const files = await fs.readdir(dir);
  // debug.log(`${dir} 内のファイル数: ${files.length}`);

  // Promise.allを使って並列処理
  const filePromises = files.map(async file => {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);

    if (stat.isDirectory()) {
      // 再帰的にディレクトリを探索
      // debug.log(`サブディレクトリ検出: ${filePath}`);
      const nestedFiles = await getHtmlFiles(filePath);
      // debug.log(`サブディレクトリ ${filePath} 内のHTMLファイル数: ${nestedFiles.length}`);
      htmlFiles = htmlFiles.concat(nestedFiles);
    } else if (file.endsWith('.html')) {
      // debug.log(`HTMLファイル発見: ${filePath}`);
      htmlFiles.push(filePath);
    }
  });

  // すべてのファイル処理が完了するのを待つ
  await Promise.all(filePromises);
  // debug.log(`ディレクトリ ${dir} の探索完了、HTMLファイル数: ${htmlFiles.length}`);
  return htmlFiles;
}

function removeDuplicateLinks(brokenLinks) {
  // debug.log(`リンク重複削除処理開始, ファイル数: ${Object.keys(brokenLinks).length}`);
  let totalLinksBefore = 0;
  let totalLinksAfter = 0;

  for (const file in brokenLinks) {
    if (brokenLinks.hasOwnProperty(file)) {
      totalLinksBefore += brokenLinks[file].length;
      brokenLinks[file] = [...new Set(brokenLinks[file])];
      totalLinksAfter += brokenLinks[file].length;
    }
  }

  // debug.log(`重複リンク削除完了 - 処理前: ${totalLinksBefore}, 処理後: ${totalLinksAfter}, 削除数: ${totalLinksBefore - totalLinksAfter}`);
  return brokenLinks;
}

// 追加: metaタグとOGPリンク、JSON-LDも処理するように修正
async function extractAndCheckMetaLinks(filePath, brokenLinks, linkCheckerCallback) {
  try {
    // ファイル読み込み
    const content = await fs.readFile(filePath, 'utf8');
    const $ = cheerio.load(content);

    // OGPとmetaタグからリンクを抽出（既存のコード）
    const metaLinks = [];

    // 1. og:imageやog:urlなどのOGPリンク
    $('meta[property^="og:"]').each((_, element) => {
      const content = $(element).attr('content');
      if (content && (content.startsWith('http://') || content.startsWith('https://'))) {
        metaLinks.push(content);
      }
    });

    // 2. Twitter Cardsのリンク
    $('meta[name^="twitter:"]').each((_, element) => {
      const content = $(element).attr('content');
      if (content && (content.startsWith('http://') || content.startsWith('https://'))) {
        metaLinks.push(content);
      }
    });

    // 3. その他のメタタグのリンク (例: canonical, alternate等)
    $('link[rel="canonical"], link[rel="alternate"], link[rel="icon"], link[rel="stylesheet"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/'))) {
        metaLinks.push(href);
      }
    });

    // 4. その他のmetaタグのcontent属性内のURL
    $('meta').each((_, element) => {
      const content = $(element).attr('content');
      if (content && (content.startsWith('http://') || content.startsWith('https://'))) {
        metaLinks.push(content);
      }
    });

    // 5. JSON-LDからリンクを抽出（新規追加部分）
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const jsonContent = $(element).html();
        // JSON-LDを解析
        const jsonData = JSON.parse(jsonContent);

        // JSON-LDからURLを再帰的に抽出する
        const jsonldLinks = extractUrlsFromJsonld(jsonData);
        debug.log(`jsonld: ${jsonldLinks}`);
        metaLinks.push(...jsonldLinks);
      } catch (jsonError) {
        debug.error(`JSON-LD解析エラー ${filePath}: ${jsonError}`);
      }
    });

    // リンクが存在する場合、それらを検証
    if (metaLinks.length > 0) {
      const relativeFilePath = path.relative(publicDir, filePath);

      // debug.log(`ファイル ${relativeFilePath} からメタリンク・JSON-LDリンク ${metaLinks.length}件を抽出しました`);

      // 各リンクをチェック
      for (const link of metaLinks) {
        // 実際にリンクをチェックするロジック
        await checkSingleLink(link, relativeFilePath, brokenLinks, linkCheckerCallback);
      }
    }
  } catch (error) {
    debug.error(`メタリンク/JSON-LD抽出エラー ${filePath}: ${error}`);
  }
}

// JSON-LDから再帰的にURLを抽出する新しい関数
function extractUrlsFromJsonld(jsonObj) {
  const urls = [];

  // オブジェクトの再帰的な走査
  function traverse(obj) {
    if (!obj || typeof obj !== 'object') return;

    // 配列の場合は各要素を処理
    if (Array.isArray(obj)) {
      obj.forEach(item => traverse(item));
      return;
    }

    // オブジェクトのキーと値をループ
    for (const [key, value] of Object.entries(obj)) {
      // URL関連のプロパティ名を検出
      const urlProperties = [
        'url', 'image', 'logo', 'thumbnail', 'contentUrl',
        'embedUrl', 'thumbnailUrl', 'downloadUrl', 'sameAs',
        'link', 'href', 'src', 'profileUrl', 'significantLink'
      ];

      // 値がURL文字列の場合
      if (typeof value === 'string') {
        // キーがURL関連のプロパティか、値がURLの形式の場合
        if (
          urlProperties.some(prop => key.toLowerCase().includes(prop.toLowerCase())) ||
          value.match(/^https?:\/\//) ||
          value.startsWith('/')
        ) {
          urls.push(value);
        }
      }
      // 値がオブジェクトまたは配列の場合は再帰
      else if (value && typeof value === 'object') {
        traverse(value);
      }
    }
  }

  traverse(jsonObj);
  return urls;
}

// 追加: 単一のリンクをチェックする関数
async function checkSingleLink(url, filePath, brokenLinks, callback) {
  try {
    // `http://www.${repository_name}` から始まるURLを変換
    // const repoPattern = new RegExp(`^http://www\\.${repositoryName}`, "i");
    const repoPattern = new RegExp(`^http://www\.test-admin_submoduleA`, "i");
    if (repoPattern.test(url)) {
      url = url.replace(repoPattern, "http://localhost:8081");
    }

    // 相対パスをフルパスに変換
    if (url.startsWith('/')) {
      url = `http://localhost:8081${url}`;
    }

    // HTTPリクエストを行い、リンクが有効かチェック
    const response = await fetch(url, {
      method: 'HEAD',
      timeout: 5000,
      redirect: 'follow'
    });

    // ステータスコードが200～399の範囲外ならブロークンリンクと判断
    if (response.status < 200 || response.status >= 400) {
      if (!brokenLinks[filePath]) {
        brokenLinks[filePath] = [];
      }
      brokenLinks[filePath].push(url);

      // カウンターをインクリメント
      totalBrokenLinksCount++;

      // コールバック関数があれば実行
      if (typeof callback === 'function') {
        callback({
          broken: true,
          url: { original: url },
          base: { original: filePath }
        });
      }

      // debug.log(`メタリンク切れ検出: ${url} in ${filePath}`);
    }
  } catch (error) {
    // 接続エラーなどはリンク切れとして扱う
    if (!brokenLinks[filePath]) {
      brokenLinks[filePath] = [];
    }
    brokenLinks[filePath].push(url);

    // カウンターをインクリメント
    totalBrokenLinksCount++;

    // コールバック関数があれば実行
    if (typeof callback === 'function') {
      callback({
        broken: true,
        url: { original: url },
        base: { original: filePath }
      });
    }

    // debug.log(`メタリンク接続エラー: ${url} in ${filePath} - ${error.message}`);
  }
}

// GitHubへの通知関数を修正
async function notifyGitHub(brokenLinks) {
  // debug.log(`GitHub通知処理開始`);
  const outputPath = process.env.GITHUB_OUTPUT;

  // 100件のみを表示するために処理
  let limitedBrokenLinks = {};
  let displayedCount = 0;
  let hasMoreThan100 = false;

  // 全体のカウントを取得
  let totalLinks = 0;
  for (const file in brokenLinks) {
    if (brokenLinks.hasOwnProperty(file)) {
      totalLinks += brokenLinks[file].length;
    }
  }

  hasMoreThan100 = totalLinks > 100;

  // 100件だけを出力用に抽出
  for (const file in brokenLinks) {
    if (brokenLinks.hasOwnProperty(file) && displayedCount < 100) {
      if (!limitedBrokenLinks[file]) {
        limitedBrokenLinks[file] = [];
      }

      for (const link of brokenLinks[file]) {
        if (displayedCount < 100) {
          limitedBrokenLinks[file].push(link);
          displayedCount++;
        } else {
          break;
        }
      }

      // 空の配列は削除
      if (limitedBrokenLinks[file].length === 0) {
        delete limitedBrokenLinks[file];
      }
    }
  }

  // 101件以上ある場合の付帯情報を追加
  if (hasMoreThan100) {
    limitedBrokenLinks['__info__'] = [`リンク切れは合計${totalLinks}件あります。上記は最初の100件のみを表示しています。`];
  }

  if (outputPath) {
    const errors = JSON.stringify(limitedBrokenLinks);
    // debug.log(`GitHubアクション出力ファイルパス: ${outputPath}`);
    fsSync.appendFileSync(outputPath, `errors=${errors}\n`);
    // debug.log(`GitHubアクション出力ファイルに書き込み完了`);
  } else {
    // debug.log(`GitHubアクション出力ファイルパスが存在しません`);
  }
  // debug.info(`GitHub Notice: Broken links detected - ${JSON.stringify(limitedBrokenLinks)}`);
}

// メイン関数を作成し、非同期処理を実行
async function main() {
  // debug.info("リンクチェッカー開始...");
  const startTime = Date.now();
  const brokenLinks = {};
  const checkedFiles = [];
  const failedFiles = [];
  const linkCounts = { total: 0, broken: 0 };
  let shouldStopChecking = false;

  try {
    // debug.log(`HTMLファイル探索開始: ${publicDir}`);
    const htmlFiles = await getHtmlFiles(publicDir);
    // debug.info(`チェック対象HTMLファイル数: ${htmlFiles.length}`);

    // SiteCheckerをPromise化する
    const siteCheckerPromise = (url, originalPath, checker) => {
      return new Promise((resolve) => {
        // debug.log(`リンクチェック開始: ${url} (${originalPath})`);
        const urlCheckStartTime = Date.now();

        // ここで変数を定義 - これが重要な修正点
        let urlLinkCount = 0;
        let urlBrokenCount = 0;

        // このurl特有のリンクカウントを追跡するためのクロージャーを作成
        checker.linkCounters = {
          increment: () => urlLinkCount++,
          getBroken: () => urlBrokenCount++,
          getTotal: () => urlLinkCount,
          getBrokenTotal: () => urlBrokenCount,
          getStartTime: () => urlCheckStartTime,
          getUrl: () => url
        };

        checker.enqueue(url);
        resolve();
      });
    };

    // リンク検出時のコールバック関数
    const linkCallback = (result) => {
      // リンクカウンターをインクリメント
      if (checkerInstance.linkCounters) {
        checkerInstance.linkCounters.increment();
      }

      linkCounts.total++;

      if (result.broken) {
        // 壊れたリンクカウンターをインクリメント
        if (checkerInstance.linkCounters) {
          checkerInstance.linkCounters.getBroken();
        }

        linkCounts.broken++;
        totalBrokenLinksCount++;

        // 正規表現を使用してプロトコル + ドメイン部分を削除
        const file = result.base.original.replace(/^https?:\/\/[^/]+/, '');

        // debug.log(`リンク切れ検出: ${result.url.original} in ${file}`);

        if (file !== "/") {
          if (!brokenLinks[file]) {
            brokenLinks[file] = [];
          }
          brokenLinks[file].push(result.url.original);
        }

        // リンク切れが101件に達したらフラグをセット
        if (totalBrokenLinksCount >= BROKEN_LINKS_LIMIT && !shouldStopChecking) {
          shouldStopChecking = true;
          debug.info(`リンク切れが${BROKEN_LINKS_LIMIT}件に達したため、調査を中止します`);
          checkerInstance.pause(); // チェックを一時停止

          // 結果を処理して終了
          processFinalResults();
        }
      }
    };

    // チェッカーのインスタンスを作成
    const checkerInstance = new SiteChecker({
      excludedKeywords: ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'typesquare.com'],
      excludeExternalLinks: false,
      excludeInternalLinks: false,
      excludeLinksToSamePage: true,
      filterLevel: 3,
      acceptedSchemes: ["http", "https"],
      requestMethod: "get",
      maxSocketsPerHost: 5, // 同一ホストへの接続数を制限
      timeout: 10000 // タイムアウト値を設定（10秒）
    }, {
      link: linkCallback,
      end: () => {
        if (checkerInstance.linkCounters) {
          const url = checkerInstance.linkCounters.getUrl();
          const urlCheckStartTime = checkerInstance.linkCounters.getStartTime();
          const urlLinkCount = checkerInstance.linkCounters.getTotal();
          const urlBrokenCount = checkerInstance.linkCounters.getBrokenTotal();

          const urlCheckEndTime = Date.now();
          const urlCheckDuration = (urlCheckEndTime - urlCheckStartTime) / 1000;
          // debug.log(`リンクチェック完了: ${url} - 処理時間: ${urlCheckDuration}秒, 総リンク数: ${urlLinkCount}, 切れたリンク: ${urlBrokenCount}`);
          checkedFiles.push(url);
        }
      },
      error: (error) => {
        let url = "unknown";
        if (checkerInstance.linkCounters) {
          url = checkerInstance.linkCounters.getUrl();
        }
        // debug.error(`リンクチェックエラー ${url}: ${error}`);
        failedFiles.push({ url, error: error.message || 'Unknown error' });
      }
    });

    // 結果を処理して終了する関数
    async function processFinalResults() {
      const brokenLinksAfterDedup = removeDuplicateLinks(brokenLinks); // 重複を削除
      await notifyGitHub(brokenLinksAfterDedup);

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      debug.info(`リンクチェック完了 - 総処理時間: ${duration}秒`);
      debug.info(`検出されたリンク統計: 総数=${linkCounts.total}, 切れたリンク=${linkCounts.broken}`);

      process.exit(0);
    }

    // ファイルごとの処理を並行して実行（同時実行数を制限）
    const concurrentLimit = 5; // 同時に処理するファイル数を制限
    const chunks = [];
    let totalProcessed = 0;
    let totalStartTime = Date.now();

    // debug.log(`並列処理の同時実行数: ${concurrentLimit}`);

    // ファイルを一定数ずつのチャンクに分割
    for (let i = 0; i < htmlFiles.length; i += concurrentLimit) {
      chunks.push(htmlFiles.slice(i, i + concurrentLimit));
    }

    // debug.log(`処理チャンク数: ${chunks.length}`);

    // チャンクごとに処理（チャンク内では並列、チャンク間では直列）
    for (let chunkIndex = 0; chunkIndex < chunks.length && !shouldStopChecking; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      const chunkStartTime = Date.now();

      // debug.log(`チャンク ${chunkIndex + 1}/${chunks.length} 処理開始 (ファイル数: ${chunk.length})`);

      const chunkPromises = chunk.map(async (filePath) => {
        // 101件に達したらスキップ
        if (shouldStopChecking) return;

        try {
          const fileStartTime = Date.now();
          // debug.log(`ファイル処理開始: ${filePath}`);

          // ファイル読み込みを非同期に
          const content = await fs.readFile(filePath, 'utf8');
          // debug.log(`ファイル読み込み完了: ${filePath} (${content.length} バイト)`);

          const $ = cheerio.load(content);

          // _blankリンク置換のカウント
          let blankLinkCount = 0;
          $('a[target="_blank"]').each((index, element) => {
            $(element).attr('href', '#');
            blankLinkCount++;
          });

          // debug.log(`_blankリンク置換: ${blankLinkCount}件`);

          // ファイル書き込みも非同期に
          await fs.writeFile(filePath, $.html());
          // debug.log(`ファイル書き込み完了: ${filePath}`);

          const relativeFilePath = path.relative(publicDir, filePath);
          const url = `http://localhost:8081/${relativeFilePath}`;

          // サイトチェッカー実行
          await siteCheckerPromise(url, filePath, checkerInstance);

          // 追加: メタタグとOGPリンクのチェック
          await extractAndCheckMetaLinks(filePath, brokenLinks, linkCallback);

          const fileEndTime = Date.now();
          const fileDuration = (fileEndTime - fileStartTime) / 1000;
          // debug.log(`ファイル処理完了: ${filePath} - 処理時間: ${fileDuration}秒`);
          totalProcessed++;

          // 進捗状況の表示
          const progressPercent = (totalProcessed / htmlFiles.length * 100).toFixed(2);
          // debug.info(`全体進捗: ${totalProcessed}/${htmlFiles.length} (${progressPercent}%)`);

        } catch (error) {
          // debug.error(`ファイル処理エラー ${filePath}: ${error}`);
          failedFiles.push({ filePath, error: error.message || 'Unknown error' });
        }
      });

      // 現在のチャンク内のすべてのファイルの処理が完了するのを待つ
      try {
        await Promise.all(chunkPromises);
        const chunkEndTime = Date.now();
        const chunkDuration = (chunkEndTime - chunkStartTime) / 1000;
        // debug.log(`チャンク ${chunkIndex + 1}/${chunks.length} 処理完了 - 処理時間: ${chunkDuration}秒`);
      } catch (error) {
        // debug.error(`チャンク ${chunkIndex + 1}/${chunks.length} 処理中にエラー発生: ${error}`);
        // エラーが発生してもプロセスを継続
      }
    }

    // 101件未満で全ての処理が終わった場合
    if (!shouldStopChecking) {
      const totalEndTime = Date.now();
      const totalDuration = (totalEndTime - totalStartTime) / 1000;
      // debug.info(`リンクチェック完了 - 総処理時間: ${totalDuration}秒`);
      // debug.info(`検出されたリンク統計: 総数=${linkCounts.total}, 切れたリンク=${linkCounts.broken}`);

      const brokenLinksAfterDedup = removeDuplicateLinks(brokenLinks); // 重複を削除
      await notifyGitHub(brokenLinksAfterDedup);
    }

  } catch (error) {
    // debug.error(`リンクチェック処理中に致命的なエラーが発生: ${error}`);

    // それでも可能であれば結果を出力
    if (Object.keys(brokenLinks).length > 0) {
      // debug.log(`エラーが発生しましたが、それまでの結果を出力します`);
      await notifyGitHub(brokenLinks);
    }

    process.exit(1);
  }
}

// メイン関数の実行
main().catch(error => {
  // debug.error(`メイン関数で未処理のエラーが発生: ${error}`);

  // プロセスの使用メモリを表示
  const memoryUsage = process.memoryUsage();
  debug.error(`プロセスメモリ使用状況: ${JSON.stringify({
    rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`
  })}`);

  process.exit(1);
});
