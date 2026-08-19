process.env.JWT_SECRET = 'test-secret'

jest.mock('pg', () => {
  const query = jest.fn()
  return { Pool: jest.fn(() => ({ query })) }
})
jest.mock('bcrypt', () => ({ compare: jest.fn() }))

const request = require('supertest')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { Pool } = require('pg')
const app = require('../index')

const pool = new Pool()

beforeEach(() => {
  pool.query.mockReset()
  bcrypt.compare.mockReset()
})

describe('POST /auth/login', () => {
  test('utilise une requête paramétrée — régression sur l\'injection SQL corrigée en Phase 1', async () => {
    pool.query.mockResolvedValue({ rows: [] })
    const payload = { email: "attacker@x.com' OR '1'='1", password: 'x' }
    await request(app).post('/auth/login').send(payload)
    expect(pool.query).toHaveBeenCalledWith(
      'SELECT * FROM users WHERE email = $1',
      [payload.email]
    )
  })

  test('401 si aucun utilisateur ne correspond à l\'email', async () => {
    pool.query.mockResolvedValue({ rows: [] })
    const res = await request(app).post('/auth/login').send({ email: 'x@y.com', password: 'x' })
    expect(res.status).toBe(401)
  })

  test('401 si le mot de passe est invalide', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, email: 'x@y.com', role: 'user', password_hash: 'hash' }] })
    bcrypt.compare.mockResolvedValue(false)
    const res = await request(app).post('/auth/login').send({ email: 'x@y.com', password: 'wrong' })
    expect(res.status).toBe(401)
  })

  test('200 et un JWT signé si les identifiants sont valides', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, email: 'x@y.com', role: 'admin', password_hash: 'hash' }] })
    bcrypt.compare.mockResolvedValue(true)
    const res = await request(app).post('/auth/login').send({ email: 'x@y.com', password: 'good' })
    expect(res.status).toBe(200)
    expect(res.body.user).toEqual({ id: 1, email: 'x@y.com', role: 'admin' })
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET)
    expect(decoded.role).toBe('admin')
  })
})

describe('Configuration de la connexion Postgres', () => {
  test('utilise DB_HOST/DB_PORT/DB_NAME/DB_USER quand ils sont définis (pas les valeurs par défaut prod)', () => {
    jest.isolateModules(() => {
      process.env.DB_HOST = 'db'
      process.env.DB_PORT = '5433'
      process.env.DB_NAME = 'hrflow_test'
      process.env.DB_USER = 'test_user'
      require('../index')
      expect(Pool).toHaveBeenCalledWith(expect.objectContaining({
        host: 'db', port: '5433', database: 'hrflow_test', user: 'test_user'
      }))
      delete process.env.DB_HOST
      delete process.env.DB_PORT
      delete process.env.DB_NAME
      delete process.env.DB_USER
    })
  })
})

describe('POST /auth/verify', () => {
  test('valid: true pour un token signé avec le bon secret', async () => {
    const token = jwt.sign({ userId: 1, role: 'user' }, process.env.JWT_SECRET)
    const res = await request(app).post('/auth/verify').send({ token })
    expect(res.status).toBe(200)
    expect(res.body.valid).toBe(true)
  })

  test('valid: false pour un token invalide', async () => {
    const res = await request(app).post('/auth/verify').send({ token: 'garbage' })
    expect(res.status).toBe(401)
    expect(res.body.valid).toBe(false)
  })
})

describe('GET /health', () => {
  it('retourne 200 et status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})
