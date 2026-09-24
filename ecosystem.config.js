// PM2 config for a VPS:  pm2 start ecosystem.config.js && pm2 save
module.exports = {
  apps: [{
    name: 'radiant-health',
    script: 'server.js',
    instances: 1,
    env: { NODE_ENV: 'production', PORT: 3000 }
  }]
};
