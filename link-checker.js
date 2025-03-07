const { SiteChecker } = require("broken-link-checker");
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const publicDir = path.join(__dirname, 'public');
const htmlFiles = fs.readdirSync(publicDir).filter(file => file.endsWith('.html'));

let brokenLinks = [];

const siteChecker = new SiteChecker({
  excludeExternalLinks: true,
  excludeLinksToSamePage: true,
  filterLevel: 3,
  acceptedSchemes: ["http", "https"],
  requestMethod: "get"
}, {
  link: (result) => {
    if (result.broken) {
      console.log(`${result.url.original}: Broken`);
      brokenLinks.push(result.url.original);
    }
  },
  end: () => {
    console.log("Link checking completed.");

    // JSON.stringify で文字列化し、エスケープ処理を行う
    fs.appendFileSync(outputPath, `errors=${JSON.stringify(brokenLinks).replace(/"/g, '\\"')}\n`);
  }
});
