process.env.JWT_SECRET = 'test-secret'
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3005'
 
// swagger.js appelle setupSwagger(app) de façon async sans jamais être attendu
// par index.js (pas de await/then), et fait de vrais appels réseau vers les
// autres services (auth, paie...) pour fusionner leurs specs OpenAPI. Comme
// rien n'attend cette promesse, le nombre de branches réellement exécutées
// dépend du timing du runner (résolution DNS qui échoue plus ou moins vite) :
// coverage stable à ~92% en local, tombée à ~22% sur les runners CI plus
// lents, faisant échouer le seuil global de 80%. La génération de doc Swagger
// n'est pas la logique métier testée ici (voir gateway.test.js), donc on la
// mocke pour retirer cette source de flakiness du calcul de coverage.
jest.mock('../../swagger', () => jest.fn())
 
// Le vrai http-proxy-middleware ouvrirait une connexion réseau vers les
// services backend — non pertinent en test unitaire. On mocke pour vérifier
// le contrat (cible, pathRewrite, ordre des middlewares) sans réseau réel.
jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: jest.fn((opts) => (req, res) => res.json({ proxied: true, target: opts.target, pathRewrite: opts.pathRewrite }))
}))
 
const request = require('supertest')
const jwt = require('jsonwebtoken')
const { createProxyMiddleware } = require('http-proxy-middleware')
const app = require('../index')
 
function makeToken(role) {
  return jwt.sign({ userId: 1, role }, process.env.JWT_SECRET)
}
 
describe('GET /health', () => {
  test('200 ok, sans authentification', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})
 
describe('CORS', () => {
  test('reflète Access-Control-Allow-Origin pour une origine autorisée', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:3005')
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3005')
  })
 
  test('n\'ajoute pas Access-Control-Allow-Origin pour une origine non autorisée', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://evil.example')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
 
  test('répond 204 à une préflight OPTIONS', async () => {
    const res = await request(app).options('/api/paie').set('Origin', 'http://localhost:3005')
    expect(res.status).toBe(204)
  })
})
 
describe('/api/auth — public, jamais derrière requireAuth', () => {
  test('accessible sans token, proxyé vers le service auth avec pathRewrite', async () => {
    const res = await request(app).get('/api/auth/verify')
    expect(res.status).toBe(200)
    expect(res.body.proxied).toBe(true)
    expect(res.body.target).toBe('http://localhost:3001')
    expect(res.body.pathRewrite).toEqual({ '^/api': '' })
  })
})
 
describe.each([
  ['/api/paie', 'http://localhost:3002'],
  ['/api/conges', 'http://localhost:3003'],
  ['/api/recrutement', 'http://localhost:3004'],
])('%s — protégé par requireAuth depuis la Phase 0', (routePrefix, expectedTarget) => {
  test('401 sans token, le proxy n\'est jamais atteint', async () => {
    const res = await request(app).get(`${routePrefix}/anything`)
    expect(res.status).toBe(401)
    expect(res.body.proxied).toBeUndefined()
  })
 
  test('200 et proxyé avec un token valide', async () => {
    const res = await request(app).get(`${routePrefix}/anything`).set('Authorization', `Bearer ${makeToken('user')}`)
    expect(res.status).toBe(200)
    expect(res.body.proxied).toBe(true)
    expect(res.body.target).toBe(expectedTarget)
  })
})
 
describe('error handler middleware', () => {
  test('renvoie une erreur 500 JSON quand un handler pousse une exception', () => {
    const errorLayer = app._router.stack.find(layer => layer.handle.length === 4)
    expect(errorLayer).toBeTruthy()
 
    const req = {}
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    }
    const next = jest.fn()
 
    errorLayer.handle(new Error('boom'), req, res, next)
 
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'boom',
      stack: expect.any(String),
    }))
  })
})