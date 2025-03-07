const { exec } = require('child_process');
const fs = require('fs');

exec('npx broken-link-checker http://localhost:8080 --json', (error, stdout, stderr) => {
  if (error) {
    console.error(`exec error: ${error}`);
    return;
  }

  const result = JSON.parse(stdout);
  const errors = result.filter(link => link.broken);

  if (errors.length > 0) {
    const errorMessages = errors.map(error => `Broken link: ${error.url} - ${error.reason}`).join('\n');
    fs.writeFileSync(process.env.GITHUB_OUTPUT, `errors=${errorMessages}`);
  } else {
    fs.writeFileSync(process.env.GITHUB_OUTPUT, 'errors=No broken links found');
  }
});
