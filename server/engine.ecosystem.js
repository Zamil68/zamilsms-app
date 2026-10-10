module.exports = {
  apps: [{
    name: 'engine.ecosystem',
    script: '/opt/zamil/server/engine.js',
    env: {
      LAMIX_API_KEY: 'iXtw9MALBMMICFE6gVAzHgBQu0WyDPlMPOKjHyztc8A',
      LAMIX_REST: 'https://panel.lamix.org/api/v1',
      ENGINE_LAMIX_LIVE: '1',
      BOAT_SECRET: '41c7bd42e4240697df4b0cc5ae91536babbd8c3b98509478fe39ab7d46f363e7'
    }
  }]
};
