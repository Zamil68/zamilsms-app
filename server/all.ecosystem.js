module.exports = {
  "apps": [
    {
      "name": "zamil-api",
      "script": "./server.js",
      "env": {
        "NODE_ENV": "production",
        "JWT_SECRET": "ecc2670593b2cb48434ac0a475d7a0151ec9ab6e54807331e68fdafb4f46f472",
        "BOAT_SECRET": "41c7bd42e4240697df4b0cc5ae91536babbd8c3b98509478fe39ab7d46f363e7",
        "SUPER_ADMIN": "Sameer_Khan221",
        "LAMIX_API_KEY": "iXtw9MALBMMICFE6gVAzHgBQu0WyDPlMPOKjHyztc8A",
        "SUPABASE_URL": "http://127.0.0.1:3001",
        "SUPABASE_SERVICE_KEY": "local",
        "CORS_ORIGIN": "*"
      }
    },
    {
      "name": "engine.ecosystem",
      "script": "./engine.js",
      "env": {
        "LAMIX_API_KEY": "sXrCPzJrMBhfvNK6ZZU4WwbqNNHPZEby6Gj0KuIebMk",
        "LAMIX_REST": "https://panel.lamix.org/api/v1",
        "ENGINE_LAMIX_LIVE": "1",
        "BOAT_SECRET": "41c7bd42e4240697df4b0cc5ae91536babbd8c3b98509478fe39ab7d46f363e7",
        "JWT_SECRET": "ecc2670593b2cb48434ac0a475d7a0151ec9ab6e54807331e68fdafb4f46f472"
      }
    }
  ]
}
