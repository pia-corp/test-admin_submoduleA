const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const blc = require('broken-link-checker');
const cheerio = require('cheerio');

const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const stat = promisify(fs.stat);

// HTMLファイルを再帰的に検索する関数
async function findHtmlFiles(dir) {
  try {
    const files = await readdir(dir);
    const htmlFiles = [];

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = await stat(filePath);

      if (stats.isDirectory()) {
        const subDirFiles = await findHtmlFiles(filePath);
        htmlFiles.push(...subDirFiles);
      } else if (file.endsWith('.html')) {
        htmlFiles.push(filePath);
      }
    }

    return htmlFiles;
  } catch (error) {
    console.error(`ディレクトリの読み取りエラー (${dir}):`, error.message);
    return [];
  }
}

// 一つのHTMLファイルのリンクをチェックする関数
function checkFileLinks(filePath) {
  return new Promise(async (resolve) => {
    try {
      const brokenLinks = [];
      const fileContent = await readFile(filePath, 'utf-8');
      const $ = cheerio.load(fileContent);
      let pendingLinks = 0;
      let completed = false;

      // すべてのaタグのhref属性を取得
      const links = $('a').map((i, el) => $(el).attr('href')).get()
        .filter(href => href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:'));

      if (links.length === 0) {
        return resolve({ filePath, brokenLinks: [] });
      }

      // タイムアウト処理（10秒でタイムアウト）
      const timeout = setTimeout(() => {
        if (!completed) {
          completed = true;
          console.log(`タイムアウト: ${filePath}`);
          resolve({ filePath, brokenLinks });
        }
      }, 10000);

      const urlChecker = new blc.HtmlUrlChecker(
        { honorRobotExclusions: false, excludeExternalLinks: false },
        {
          link: (result) => {
            if (result.broken) {
              brokenLinks.push({
                url: result.url.original,
                reason: result.brokenReason
              });
            }
            pendingLinks--;
            if (pendingLinks === 0 && completed) {
              clearTimeout(timeout);
              resolve({ filePath, brokenLinks });
            }
          },
          complete: () => {
            completed = true;
            if (pendingLinks === 0) {
              clearTimeout(timeout);
              resolve({ filePath, brokenLinks });
            }
          }
        }
      );

      pendingLinks = links.length;
      for (const link of links) {
        let url = link;
        if (!url.startsWith('http') && !url.startsWith('file://')) {
          // 相対パスを絶対パスに変換
          const baseDir = path.dirname(filePath);
          url = `file://${path.resolve(baseDir, url)}`;
        }
        urlChecker.enqueue(url);
      }
    } catch (error) {
      console.error(`ファイル処理エラー (${filePath}):`, error.message);
      resolve({ filePath, brokenLinks: [] });
    }
  });
}

async function main() {
  try {
    console.log('リンクチェック開始...');

    // publicディレクトリが存在するか確認
    try {
      await stat('public');
    } catch (error) {
      console.error('publicディレクトリが見つかりません:', error.message);
      console.log('カレントディレクトリの内容:');
      const files = await readdir('.');
      console.log(files);
      process.exit(1);
    }

    // publicディレクトリ内のすべてのHTMLファイルを検索
    const htmlFiles = await findHtmlFiles('public');
    console.log(`${htmlFiles.length} HTMLファイルが見つかりました`);

    if (htmlFiles.length === 0) {
      console.log('HTMLファイルが見つかりませんでした');
      await writeFile('broken_links_result.md', 'HTMLファイルが見つかりませんでした');
      process.exit(0);
    }

    // すべてのファイルのリンクを並行してチェック
    const results = await Promise.all(htmlFiles.map(file => checkFileLinks(file)));

    // 壊れたリンクがあるファイルのみをフィルタリング
    const filesWithBrokenLinks = results.filter(result => result.brokenLinks.length > 0);

    // マークダウン形式で結果を出力
    let markdown = '| ファイル名 | リンク切れパス |\n|----------|-------------|\n';
    let hasBrokenLinks = false;

    for (const result of filesWithBrokenLinks) {
      for (const link of result.brokenLinks) {
        hasBrokenLinks = true;
        markdown += `| ${result.filePath} | ${link.url} |\n`;
      }
    }

    // 結果をファイルに書き込み
    if (hasBrokenLinks) {
      await writeFile('broken_links_result.md', markdown);
      console.log('リンク切れが見つかりました');
    } else {
      await writeFile('broken_links_result.md', 'リンク切れは見つかりませんでした');
      console.log('リンク切れは見つかりませんでした');
    }
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

main();
