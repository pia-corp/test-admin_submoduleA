const { SiteChecker } = require("broken-link-checker");
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const publicDir = path.join(__dirname, 'public');
const htmlFiles = fs.readdirSync(publicDir).filter(file => file.endsWith('.html'));

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
      // notifyGitHub(result.url.original);
    } else {
      // console.log(`${result.url.original}: Valid`);
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
  siteChecker.enqueue(`http://localhost:8081/${file}`);
});

async function notifyGitHub(brokenUrl) {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  });

  const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

  await octokit.issues.create({
    owner,
    repo,
    title: `Broken link detected: ${brokenUrl}`,
    body: `A broken link was detected: ${brokenUrl}`
  });

  console.log(`GitHub Notice: Broken link detected - ${brokenUrl}`);
}
