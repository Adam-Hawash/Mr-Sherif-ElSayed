/**
 * تشغيل منصة Math Genius في الإنتاج على سيرفر أوراكل عبر PM2
 * الاستخدام:  pm2 start ecosystem.config.cjs
 * بعدها:      pm2 save  ثم  pm2 startup  (ونفّذ السطر اللي بيطلعلك)
 */
module.exports = {
  apps: [
    {
      name: 'math-genius',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
      autorestart: true,
      max_memory_restart: '900M',
      time: true,
    },
  ],
}
