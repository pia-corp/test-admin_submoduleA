const { SiteChecker } = require("broken-link-checker");
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const publicDir = path.join(__dirname, 'public');
const htmlFiles = fs.readdirSync(publicDir).filter(file => file.endsWith('.html'));

const siteChecker = new SiteChecker({}, {
  link: (result) => {
    if (result.broken) {
      console.log(`${result.url.original}: Broken`);
      notifyGitHub(result.url.original);
    } else {
      console.log(`${result.url.original}: Valid`);
    }
  },
  end: () => {
    console.log("Link checking completed.");
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
  siteChecker.enqueue(`http://127.0.0.1:8080/${file}`);
});

function notifyGitHub(brokenUrl) {
  const outputPath = process.env.GITHUB_OUTPUT || '/tmp/github_output';
  const resultString = "${brokenUrl}";
  // fs.appendFileSync(outputPath, output);
  // console.log(`GitHub Notice: Broken link detected - ${brokenUrl}`);


  // const resultString = "this is lighthouse result string";
  // 結果をGITHUB_OUTPUTに出力する。
  fs.writeFileSync(outputPath, `resultString=${resultString}`);
  console.log('String generated and output to GITHUB_OUTPUT.');
}
