const { SiteChecker } = require("broken-link-checker");
const fs = require('fs').promises;
const fsSync = require('fs'); // 一部の操作は同期処理のままにする
const path = require('path');
const cheerio = require('cheerio');

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

async function notifyGitHub(brokenLinks) {
  // debug.log(`GitHub通知処理開始`);
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const errors = JSON.stringify(brokenLinks);
    // debug.log(`GitHubアクション出力ファイルパス: ${outputPath}`);
    fsSync.appendFileSync(outputPath, `errors=${errors}\n`);
    // debug.log(`GitHubアクション出力ファイルに書き込み完了`);
  } else {
    // debug.log(`GitHubアクション出力ファイルパスが存在しません`);
  }
  // debug.info(`GitHub Notice: Broken links detected - ${JSON.stringify(brokenLinks)}`);
}

// メイン関数を作成し、非同期処理を実行
async function main() {
  // debug.info("リンクチェッカー開始...");
  const startTime = Date.now();
  const brokenLinks = {};
  const checkedFiles = [];
  const failedFiles = [];
  const linkCounts = { total: 0, broken: 0 };

  try {
    // debug.log(`HTMLファイル探索開始: ${publicDir}`);
    const htmlFiles = await getHtmlFiles(publicDir);
    // debug.info(`チェック対象HTMLファイル数: ${htmlFiles.length}`);

    // SiteCheckerをPromise化する
    const siteCheckerPromise = (url, originalPath) => {
      return new Promise((resolve, reject) => {
        // debug.log(`リンクチェック開始: ${url} (${originalPath})`);
        const urlCheckStartTime = Date.now();
        let urlLinkCount = 0;
        let urlBrokenCount = 0;

        const checker = new SiteChecker({
          excludedKeywords: ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
          excludeExternalLinks: false,
          excludeInternalLinks: false,
          excludeLinksToSamePage: true,
          filterLevel: 3,
          acceptedSchemes: ["http", "https"],
          requestMethod: "get",
          maxSocketsPerHost: 5, // 同一ホストへの接続数を制限
          timeout: 10000 // タイムアウト値を設定（10秒）
        }, {
          link: (result) => {
            urlLinkCount++;
            linkCounts.total++;

            if (result.broken) {
              urlBrokenCount++;
              linkCounts.broken++;

              // 正規表現を使用してプロトコル + ドメイン部分を削除
              const file = result.base.original.replace(/^https?:\/\/[^/]+/, '');

              // debug.log(`リンク切れ検出: ${result.url.original} in ${file}`);

              if (file !== "/") {
                if (!brokenLinks[file]) {
                  brokenLinks[file] = [];
                }
                brokenLinks[file].push(result.url.original);
              }
            }
          },
          end: () => {
            const urlCheckEndTime = Date.now();
            const urlCheckDuration = (urlCheckEndTime - urlCheckStartTime) / 1000;
            // debug.log(`リンクチェック完了: ${url} - 処理時間: ${urlCheckDuration}秒, 総リンク数: ${urlLinkCount}, 切れたリンク: ${urlBrokenCount}`);
            checkedFiles.push(url);
            resolve();
          },
          error: (error) => {
            // debug.error(`リンクチェックエラー ${url}: ${error}`);
            failedFiles.push({ url, error: error.message || 'Unknown error' });
            reject(error);
          }
        });

        checker.enqueue(url);
      });
    };

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
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      const chunkStartTime = Date.now();

      // debug.log(`チャンク ${chunkIndex + 1}/${chunks.length} 処理開始 (ファイル数: ${chunk.length})`);

      const chunkPromises = chunk.map(async (filePath) => {
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
          await siteCheckerPromise(url, filePath);

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
          throw error;
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

    const totalEndTime = Date.now();
    const totalDuration = (totalEndTime - totalStartTime) / 1000;
    // debug.info(`リンクチェック完了 - 総処理時間: ${totalDuration}秒`);
    // debug.info(`検出されたリンク統計: 総数=${linkCounts.total}, 切れたリンク=${linkCounts.broken}`);

    const brokenLinksAfterDedup = removeDuplicateLinks(brokenLinks); // 重複を削除
    await notifyGitHub(brokenLinksAfterDedup);

    // // 失敗したファイルの報告
    // if (failedFiles.length > 0) {
    //   debug.error(`処理に失敗したファイル: ${failedFiles.length}件`);
    //   failedFiles.forEach(fail => {
    //     debug.error(`- ${fail.filePath || fail.url}: ${fail.error}`);
    //   });
    // }

    // debug.info(`チェック完了したファイル: ${checkedFiles.length}件`);
    // checkedFiles.forEach(file => debug.log(`- ${file}`));

  } catch (error) {
    // debug.error(`リンクチェック処理中に致命的なエラーが発生: ${error}`);

    // // エラーのスタックトレースを表示
    // if (error.stack) {
    //   debug.error(`エラースタックトレース: ${error.stack}`);
    // }

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

  // // エラーのスタックトレースを表示
  // if (error.stack) {
  //   debug.error(`エラースタックトレース: ${error.stack}`);
  // }

  // プロセスの使用メモリを表示
  const memoryUsage = process.memoryUsage();
  debug.error(`プロセスメモリ使用状況: ${JSON.stringify({
    rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`
  })}`);

  process.exit(1);
});
