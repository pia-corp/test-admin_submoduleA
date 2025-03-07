const { SiteChecker } = require("broken-link-checker");
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const publicDir = path.join(__dirname, 'public');
const htmlFiles = fs.readdirSync(publicDir).filter(file => file.endsWith('.html'));

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
  excludeExternalLinks: true,
  excludeLinksToSamePage: true,
  filterLevel: 3,
  acceptedSchemes: ["http", "https"],
  requestMethod: "get"
}, {
  link: (result) => {
    if (result.broken) {
      const file = result.base.original.split('/').pop();
      if (file != "") {
        if (!brokenLinks[file]) {
          brokenLinks[file] = [];
        }
        brokenLinks[file].push(result.url.original);
      }

    } else {
      // console.log(`${result.url.original}: Valid`);
    }
  },
  end: async () => {
    console.log("Link checking completed.");
    removeDuplicateLinks(brokenLinks); // 重複を削除
    await notifyGitHub(brokenLinks);
    console.log("Checked files:");
    checkedFiles.forEach(file => console.log(file));
  }
});

htmlFiles.forEach(file => {
  const filePath = path.join(publicDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(content);

  $('a[target="_blank"]').each((index, element) => {
    $(element).attr('href', '#');
  });

  fs.writeFileSync(filePath, $.html());
  siteChecker.enqueue(`http://localhost:8081/${file}`);
});

async function notifyGitHub(brokenLinks) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const errors = JSON.stringify(brokenLinks);
    fs.appendFileSync(outputPath, `errors=${errors}\n`);
  }
  console.log(`GitHub Notice: Broken links detected - ${JSON.stringify(brokenLinks)}`);
}
