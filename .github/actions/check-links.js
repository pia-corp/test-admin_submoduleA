const fs = require('fs');
const path = require('path');
const blc = require('broken-link-checker');
const glob = require('glob');
const core = require('@actions/core');
const github = require('@actions/github');

// GitHubトークンを取得
const token = process.env.GITHUB_TOKEN;
const octokit = github.getOctokit(token);

// GitHub関連の情報を取得
const context = github.context;
const repo = context.repo;
const prNumber = context.payload.pull_request ? context.payload.pull_request.number : null;

// エラーリンクを保存する配列
const brokenLinks = [];

// HTMLファイルを検索するフォルダパス
const publicDir = path.join(process.cwd(), 'public');

// BLCオプション設定
const options = {
  filterLevel: 3, // 全てのリンクをチェック
  honorRobotExclusions: true,
  maxSocketsPerHost: 5,
  requestMethod: "GET",
  userAgent: "Mozilla/5.0 (compatible; GithubActionsLinkChecker/1.0)"
};

// リンクチェック結果を処理する関数
function handleBrokenLink(result) {
  if (result.broken) {
    // リンク切れの情報を記録
    brokenLinks.push({
      filename: path.relative(process.cwd(), result.base.original),
      link: result.url.original,
      reason: result.brokenReason
    });

    console.log(`リンク切れ検出: ${result.url.original} in ${result.base.original} (${result.brokenReason})`);
  }
}

// サイトスキャン完了後の処理
async function handleScanComplete() {
  if (brokenLinks.length > 0) {
    console.log(`合計 ${brokenLinks.length} 個のリンク切れを検出しました。`);

    // マークダウンテーブルの作成
    let comment = "## リンク切れ検出レポート\n\n";
    comment += "以下のリンク切れが検出されました。修正をお願いします。\n\n";
    comment += "| ファイル名 | リンク切れパス | その他情報 |\n";
    comment += "|----------|------------|----------|\n";

    brokenLinks.forEach(link => {
      comment += `| ${link.filename} | ${link.link} | ${link.reason} |\n`;
    });

    // PRにコメントを投稿
    if (prNumber) {
      try {
        await octokit.rest.issues.createComment({
          ...repo,
          issue_number: prNumber,
          body: comment
        });
        console.log("プルリクエストにコメントを投稿しました。");
      } catch (error) {
        console.error("コメント投稿エラー:", error);
        core.setFailed("プルリクエストへのコメント投稿に失敗しました。");
      }
    } else {
      console.log("プルリクエストが見つからないため、コメントは投稿されませんでした。");
    }

    // アクションを失敗させる
    core.setFailed(`${brokenLinks.length} 個のリンク切れが見つかりました。`);
  } else {
    console.log("リンク切れは検出されませんでした。");

    // PRに成功メッセージを投稿
    if (prNumber) {
      try {
        await octokit.rest.issues.createComment({
          ...repo,
          issue_number: prNumber,
          body: "## リンクチェック完了\n\nリンク切れは検出されませんでした。👍"
        });
        console.log("プルリクエストに成功メッセージを投稿しました。");
      } catch (error) {
        console.log("成功メッセージ投稿エラー:", error);
      }
    }
  }
}

// HTMLファイルパスを取得
const htmlFiles = glob.sync('public/**/*.html');

// HTMLファイルがない場合は終了
if (htmlFiles.length === 0) {
  console.log("チェック対象のHTMLファイルが見つかりませんでした。");
  process.exit(0);
}

console.log(`${htmlFiles.length} 個のHTMLファイルをチェックします...`);

// 各HTMLファイルをチェック
let filesChecked = 0;

htmlFiles.forEach(htmlFile => {
  const filePath = path.resolve(htmlFile);
  const fileUrl = `file://${filePath}`;

  console.log(`チェック中: ${htmlFile}`);

  // 単一ファイルのチェッカーを作成
  const siteChecker = new blc.SiteChecker(options, {
    link: handleBrokenLink,
    complete: () => {
      filesChecked++;

      // 全ファイルのチェックが完了したらレポートを生成
      if (filesChecked === htmlFiles.length) {
        handleScanComplete();
      }
    }
  });

  // チェック開始
  siteChecker.enqueue(fileUrl);
});
