const { SiteChecker } = require("broken-link-checker");
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

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
      htmlFiles.push(filePath);
    }
  });
  return htmlFiles;
}

const htmlFiles = getHtmlFiles(publicDir);
const brokenLinks = {};

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
    if (result.broken) {
      const file = result.base.original.replace(/^https?:\/\/[^/]+/, '');
      if (file !== "/") {
        if (!brokenLinks[file]) {
          brokenLinks[file] = new Set(); // Setを使用して重複を防ぐ
        }
        brokenLinks[file].add(result.url.original);
      }
    }
  },
  end: async () => {
    console.log("Link checking completed.");
    await notifyGitHub(brokenLinks);
  }
});

async function processHtmlFiles() {
  for (const filePath of htmlFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(content);
    $('a[target="_blank"]').attr('href', '#');
    fs.writeFileSync(filePath, $.html());
    siteChecker.enqueue(`http://localhost:8081/${path.relative(publicDir, filePath)}`);
  }
}

processHtmlFiles().then(() => {
  console.log("All files processed.");
});


htmlFiles.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(content);

  $('a[target="_blank"]').each((index, element) => {
    $(element).attr('href', '#');
  });

  fs.writeFileSync(filePath, $.html());
  siteChecker.enqueue(`http://localhost:8081/${path.relative(publicDir, filePath)}`);
});

async function notifyGitHub(brokenLinks) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const errors = JSON.stringify(brokenLinks);
    fs.appendFileSync(outputPath, `errors=${errors}\n`);
  }
  console.log(`GitHub Notice: Broken links detected - ${JSON.stringify(brokenLinks)}`);
}
