const { SiteChecker } = require("broken-link-checker");
const fs = require('fs').promises;
const fsSync = require('fs'); // 一部の操作は同期処理のままにする
const path = require('path');
const cheerio = require('cheerio');
const util = require('util');

const publicDir = path.join(__dirname, 'public/');

// ファイル探索を非同期に変更
async function getHtmlFiles(dir) {
  let htmlFiles = [];
  const files = await fs.readdir(dir);

  // Promise.allを使って並列処理
  const filePromises = files.map(async file => {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);

    if (stat.isDirectory()) {
      // 再帰的にディレクトリを探索
      const nestedFiles = await getHtmlFiles(filePath);
      htmlFiles = htmlFiles.concat(nestedFiles);
    } else if (file.endsWith('.html')) {
      htmlFiles.push(filePath);
    }
  });

  // すべてのファイル処理が完了するのを待つ
  await Promise.all(filePromises);
  return htmlFiles;
}

function removeDuplicateLinks(brokenLinks) {
  for (const file in brokenLinks) {
    if (brokenLinks.hasOwnProperty(file)) {
      brokenLinks[file] = [...new Set(brokenLinks[file])];
    }
  }
}

async function notifyGitHub(brokenLinks) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const errors = JSON.stringify(brokenLinks);
    fsSync.appendFileSync(outputPath, `errors=${errors}\n`);
  }
  console.log(`GitHub Notice: Broken links detected - ${JSON.stringify(brokenLinks)}`);
}

// メイン関数を作成し、非同期処理を実行
async function main() {
  console.log("Starting link checker...");
  const brokenLinks = {};
  const checkedFiles = [];

  try {
    const htmlFiles = await getHtmlFiles(publicDir);
    console.log(`Found ${htmlFiles.length} HTML files to check.`);

    // SiteCheckerをPromise化する
    const siteCheckerPromise = (url) => {
      return new Promise((resolve, reject) => {
        const checker = new SiteChecker({
          excludedKeywords: ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
          excludeExternalLinks: false,
          excludeInternalLinks: false,
          excludeLinksToSamePage: true,
          filterLevel: 3,
          acceptedSchemes: ["http", "https"],
          requestMethod: "get"
        }, {
          link: (result) => {
            if (result.broken) {
              // 正規表現を使用してプロトコル + ドメイン部分を削除
              const file = result.base.original.replace(/^https?:\/\/[^/]+/, '');

              if (file !== "/") {
                if (!brokenLinks[file]) {
                  brokenLinks[file] = [];
                }
                brokenLinks[file].push(result.url.original);
              }
            }
          },
          end: () => {
            checkedFiles.push(url);
            resolve();
          },
          error: (error) => {
            console.error(`Error checking ${url}:`, error);
            reject(error);
          }
        });

        checker.enqueue(url);
      });
    };

    // ファイルごとの処理を並行して実行（同時実行数を制限）
    const concurrentLimit = 5; // 同時に処理するファイル数を制限
    const chunks = [];

    // ファイルを一定数ずつのチャンクに分割
    for (let i = 0; i < htmlFiles.length; i += concurrentLimit) {
      chunks.push(htmlFiles.slice(i, i + concurrentLimit));
    }

    // チャンクごとに処理（チャンク内では並列、チャンク間では直列）
    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (filePath) => {
        try {
          // ファイル読み込みを非同期に
          const content = await fs.readFile(filePath, 'utf8');
          const $ = cheerio.load(content);

          $('a[target="_blank"]').each((index, element) => {
            $(element).attr('href', '#');
          });

          // ファイル書き込みも非同期に
          await fs.writeFile(filePath, $.html());

          const relativeFilePath = path.relative(publicDir, filePath);
          const url = `http://localhost:8081/${relativeFilePath}`;

          return siteCheckerPromise(url);
        } catch (error) {
          console.error(`Error processing file ${filePath}:`, error);
          throw error;
        }
      });

      // 現在のチャンク内のすべてのファイルの処理が完了するのを待つ
      await Promise.all(chunkPromises);
    }

    console.log("Link checking completed.");
    removeDuplicateLinks(brokenLinks); // 重複を削除
    await notifyGitHub(brokenLinks);

    console.log("Checked files:");
    checkedFiles.forEach(file => console.log(file));

  } catch (error) {
    console.error("Error during link checking:", error);
    process.exit(1);
  }
}

// メイン関数の実行
main().catch(error => {
  console.error("Unhandled error in main function:", error);
  process.exit(1);
});
