process.env.JWT_SECRET = 'test-secret'

jest.mock('pg', () => {
  const query = jest.fn()
  return { Pool: jest.fn(() => ({ query })) }
})

const request = require('supertest')
const jwt = require('jsonwebtoken')
const { Pool } = require('pg')
const app = require('../index')

const pool = new Pool()

function makeToken(role) {
  return jwt.sign({ userId: 1, role }, process.env.JWT_SECRET)
}

beforeEach(() => {
  pool.query.mockReset()
})

describe('GET /conges/solde/:employeeId', () => {
  test('solde = jours acquis - jours pris', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ jours_conges_acquis: 25 }] })
      .mockResolvedValueOnce({ rows: [{ nombre_jours: 5 }] })
      .mockResolvedValueOnce({ rows: [{ nombre_jours: 2 }] })
    const res = await request(app).get('/conges/solde/1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ solde: 20, joursAcquis: 25, joursPris: 5, joursEnAttente: 2 })
  })
})

describe('POST /conges/demande', () => {
  test('calcule le nombre de jours entre date_debut et date_fin', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, employee_id: 1, date_debut: '2026-08-03', date_fin: '2026-08-07', nombre_jours: 4, statut: 'en_attente' }]
    })
    const res = await request(app).post('/conges/demande').send({
      employeeId: 1, dateDebut: '2026-08-03', dateFin: '2026-08-07', motif: 'Congés été'
    })
    expect(res.status).toBe(200)
    expect(res.body.statut).toBe('en_attente')
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO conges'),
      [1, '2026-08-03', '2026-08-07', 4, 'Congés été', 'en_attente']
    )
  })
})

describe('GET /conges/debug/all — réservé aux admins depuis la Phase 0', () => {
  test('401 sans token (endpoint ajouté en urgence oct. 2023, jamais sécurisé jusqu\'ici)', async () => {
    const res = await request(app).get('/conges/debug/all')
    expect(res.status).toBe(401)
    expect(pool.query).not.toHaveBeenCalled()
  })

  test('403 avec un token valide mais non-admin', async () => {
    const res = await request(app).get('/conges/debug/all').set('Authorization', `Bearer ${makeToken('user')}`)
    expect(res.status).toBe(403)
    expect(pool.query).not.toHaveBeenCalled()
  })

  test('200 avec un token admin', async () => {
    pool.query.mockResolvedValue({ rows: [] })
    const res = await request(app).get('/conges/debug/all').set('Authorization', `Bearer ${makeToken('admin')}`)
    expect(res.status).toBe(200)
  })
})

describe('GET /health', () => {
  it('retourne 200 et status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})