const lighthouse = require('lighthouse').default;
const chromeLauncher = require('chrome-launcher');
const fs = require('fs');

const url = 'http://localhost:8081'; // チェックするURL

async function runLighthouse() {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  const options = { logLevel: 'info', output: 'html', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'], port: chrome.port };

  const runnerResult = await lighthouse(url, options);

  if (runnerResult && runnerResult.report) {
    const reportHtml = typeof runnerResult.report === 'string' ? runnerResult.report : runnerResult.report[0];
    fs.writeFileSync('lighthouse-report.html', reportHtml);
    console.log('Lighthouse report is done!');
  } else {
    console.error('Lighthouse failed to generate a report.');
  }

  await chrome.kill();
}

runLighthouse().catch(error => {
  console.error('Error running Lighthouse:', error);
});
