module.exports = { apps: [{
  name: 'zamil-api', script: 'server.js', cwd: '/opt/zamil/server',
  instances: 1, exec_mode: 'fork', max_memory_restart: '900M',
  env: {
    NODE_ENV: 'production',
    JWT_SECRET: 'ecc2670593b2cb48434ac0a475d7a0151ec9ab6e54807331e68fdafb4f46f472',
    BOAT_SECRET: '41c7bd42e4240697df4b0cc5ae91536babbd8c3b98509478fe39ab7d46f363e7',
    SUPER_ADMIN: 'Sameer_Khan221',
    LAMIX_API_KEY: 'iXtw9MALBMMICFE6gVAzHgBQu0WyDPlMPOKjHyztc8A',
    SUPABASE_URL: 'http://127.0.0.1:3001',
    SUPABASE_SERVICE_KEY: 'local',
    CORS_ORIGIN: '*'
  }
}]};
