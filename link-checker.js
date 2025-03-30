const { SiteChecker } = require("broken-link-checker");
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const REPOSITORY = process.env.REPOSITORY;
const publicDir = path.join(__dirname, 'public/');

function getHtmlFiles(dir) {
  let htmlFiles = [];
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      htmlFiles = htmlFiles.concat(getHtmlFiles(filePath));
    } else if (file.endsWith('.html')) {
      console.log("filePath:"+filePath);
      htmlFiles.push(filePath);
    }
  });
  return htmlFiles;
}

const htmlFiles = getHtmlFiles(publicDir);

const brokenLinks = {};
const checkedFiles = [];

function removeDuplicateLinks(brokenLinks) {
  for (const file in brokenLinks) {
    if (brokenLinks.hasOwnProperty(file)) {
      brokenLinks[file] = [...new Set(brokenLinks[file])];
    }
  }
}

const siteChecker = new SiteChecker({
  excludedKeywords: ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
  excludeExternalLinks: false,
  excludeInternalLinks: false,
  excludeLinksToSamePage: true,
  filterLevel: 3,
  acceptedSchemes: ["http", "https"],
  requestMethod: "get"
}, {
  link: (result) => {
    console.log("result:" + result);
    if (result.broken) {
      // 正規表現を使用してプロトコル + ドメイン部分を削除
      const file = result.base.original.replace(/^https?:\/\/[^/]+/, '');

      if (file != "/") {
        if (!brokenLinks[file]) {
          brokenLinks[file] = [];
        }
        brokenLinks[file].push(result.url.original);
      }

    } else {
      console.log(`${result.url.original}: Valid`);
    }
  },
  end: async () => {
    console.log("Link checking completed.");
    console.log("brokenLinks:" + brokenLinks);
    removeDuplicateLinks(brokenLinks); // 重複を削除
    await notifyGitHub(brokenLinks);
    console.log("Checked files:");
    checkedFiles.forEach(file => console.log(file));
  }
});

htmlFiles.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  console.log("content:" + content);
  const $ = cheerio.load(content);

  $('a[target="_blank"]').each((index, element) => {
    $(element).attr('href', '#');
  });

  fs.writeFileSync(filePath, $.html());
  siteChecker.enqueue(`http://pia2024:piapiapia@piapiapia.xsrv.jp/dev/${REPOSITORY}/${path.relative(publicDir, filePath)}`);
});

async function notifyGitHub(brokenLinks) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const errors = JSON.stringify(brokenLinks);
    fs.appendFileSync(outputPath, `errors=${errors}\n`);
  }
  console.log(`GitHub Notice: Broken links detected - ${JSON.stringify(brokenLinks)}`);
}
