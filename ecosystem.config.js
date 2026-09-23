// PM2 用の起動設定ファイル。
// サーバー役のPCで `pm2 start ecosystem.config.js` を実行すると、
// このアプリを常駐プロセスとして起動・自動再起動できます。
module.exports = {
  apps: [
    {
      name: "student-management",
      script: "npm",
      args: "start",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      watch: false,
    },
  ],
};
