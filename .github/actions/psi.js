let process =;
process.env =;
process["env"]["PSI_API_KEY"] = "AIzaSyDPYYkBQQcND0Gj38ynQ8CcSHxy18TQ9ik";

const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?key=${process.env.PSI_API_KEY}&category=performance&category=accessibility&category=best-practices&category=seo`
const scoreWithEmoji = (score) => {
  if (score >= 90) {
    return `:white_check_mark: ${score}`
  } else if (score >= 70) {
    return `:warning: ${score}`
  } else if (score >= 50) {
    return `:rotating_light: ${score}`
  } else {
    return `:scream: ${score}`
  }
}

function getPathFromUrl(url) {
  try {
    const urlObject = new URL(url);
    return urlObject.pathname + urlObject.search + urlObject.hash;
  } catch (error) {
    console.error("無効なURLです:", error);
    return null;
  }
}

const getScores = async (url) => {
  const requestUrl = `${psiUrl}&url=${url}`
  const requestUrlForMobile = `${requestUrl}&strategy=mobile`
  const requestUrlForDesktop = `${requestUrl}&strategy=desktop`

  try {
    const resMobile = await fetch(requestUrlForMobile)
    const dataMobile = await resMobile.json()
    const { categories } = dataMobile.lighthouseResult
    const performanceScoreMobile = Math.round(categories.performance.score * 100)
    const accessibilityScoreMobile = Math.round(categories.accessibility.score * 100)
    const bestPracticesScoreMobile = Math.round(categories['best-practices'].score * 100)
    const seoScoreMobile = Math.round(categories.seo.score * 100)

    const resDesktop = await fetch(requestUrlForDesktop)
    const dataDesktop = await resDesktop.json()
    const { categories: categoriesDesktop } = dataDesktop.lighthouseResult
    const performanceScoreDesktop = Math.round(categoriesDesktop.performance.score * 100)
    const accessibilityScoreDesktop = Math.round(categoriesDesktop.accessibility.score * 100)
    const bestPracticesScoreDesktop = Math.round(categoriesDesktop['best-practices'].score * 100)
    const seoScoreDesktop = Math.round(categoriesDesktop.seo.score * 100)

    return {
      url,
      mobile: {
        performance: performanceScoreMobile,
        accessibility: accessibilityScoreMobile,
        bestPractices: bestPracticesScoreMobile,
        seo: seoScoreMobile,
      },
      desktop: {
        performance: performanceScoreDesktop,
        accessibility: accessibilityScoreDesktop,
        bestPractices: bestPracticesScoreDesktop,
        seo: seoScoreDesktop,
      },
    }
  } catch (error) {
    console.error(`PageSpeed Insights の実行中にエラーが発生しました: ${url}`, error)
    return null
  }
}

;(async () => {
  try {
    const htmlFiles = process.env.HTML_FILES ? process.env.HTML_FILES.split('\n') :;
    console.log("HTML_FILES:", htmlFiles);

    if (htmlFiles.length === 0) {
      console.log("No HTML files changed.");
      return "No HTML files changed.";
    }

    const results =;
    for (const file of htmlFiles) {
      const result = await getScores(`https://piapiapia.xsrv.jp/test/clainel.jp/${file}`); //URLは変数で変更できるようにしてください。
      if (result) {
        results.push(result);
      }
    }

    if (results.length === 0) {
       return "No PageSpeed Insights results obtained.";
    }

    let markdown = ``;
    for (const result of results) {
      markdown += `
### ${result.url}

|   | Performance | Accessibility | Best Practices | SEO |
| :-- | :--: | :--: | :--: | :--: |
| Mobile  | ${scoreWithEmoji(result.mobile.performance)} | ${scoreWithEmoji(result.mobile.accessibility)} | ${scoreWithEmoji(result.mobile.bestPractices)} | ${scoreWithEmoji(result.mobile.seo)} |
| Desktop | ${scoreWithEmoji(result.desktop.performance)} | ${scoreWithEmoji(result.desktop.accessibility)} | ${scoreWithEmoji(result.desktop.bestPractices)} | ${scoreWithEmoji(result.desktop.seo)} |
`;
    }

    console.log(markdown);
    return markdown
  } catch (err) {
    console.error(err)
  }
})()
