process.env.JWT_SECRET = 'test-secret'

jest.mock('pg', () => {
  const query = jest.fn()
  return { Pool: jest.fn(() => ({ query })) }
})
jest.mock('axios')

const request = require('supertest')
const jwt = require('jsonwebtoken')
const axios = require('axios')
const { Pool } = require('pg')
const app = require('../index')

const pool = new Pool()

function makeToken(role) {
  return jwt.sign({ userId: 1, role }, process.env.JWT_SECRET)
}

beforeEach(() => {
  pool.query.mockReset()
})

describe('POST /paie/calculer', () => {
  test('404 si l\'employé n\'existe pas', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] })
    const res = await request(app).post('/paie/calculer').send({ employeeId: 999, mois: 7, annee: 2026 })
    expect(res.status).toBe(404)
  })

  test('calcule cotisations et net, insère le bulletin', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, salaire_mensuel_brut: 3000 }] })
      .mockResolvedValueOnce({})
    axios.post.mockResolvedValue({ data: {} })
    const res = await request(app).post('/paie/calculer').send({ employeeId: 1, mois: 7, annee: 2026 })
    expect(res.status).toBe(200)
    expect(res.body.brut).toBe(3000)
    expect(res.body.cotisationsSalariales).toBeCloseTo(660, 5)
    expect(res.body.net).toBeCloseTo(2340, 5)
    expect(pool.query).toHaveBeenCalledWith(
      'INSERT INTO bulletins_paie (employee_id, mois, annee, data, created_at) VALUES ($1, $2, $3, $4, NOW())',
      expect.arrayContaining([1, 7, 2026])
    )
  })

  test('bulletin renvoyé même si Stripe échoue (comportement actuel, non corrigé — voir plan de tests)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, salaire_mensuel_brut: 2000 }] })
      .mockResolvedValueOnce({})
    axios.post.mockRejectedValue(new Error('Stripe unreachable'))
    const res = await request(app).post('/paie/calculer').send({ employeeId: 1, mois: 7, annee: 2026 })
    expect(res.status).toBe(200)
    expect(res.body.net).toBeCloseTo(1560, 5)
  })
})

describe('POST /paie/heures-sup', () => {
  test('applique la majoration de 25% sur le taux horaire (fix Rayan avr. 2024)', async () => {
    pool.query.mockResolvedValue({ rows: [{ salaire_mensuel_brut: 3000 }] })
    const res = await request(app).post('/paie/heures-sup').send({ employeeId: 1, heures: 10 })
    expect(res.status).toBe(200)
    const tauxHoraireAttendu = 3000 / 151.67
    expect(res.body.tauxHoraire).toBeCloseTo(tauxHoraireAttendu, 5)
    expect(res.body.majorationHeuresSup).toBeCloseTo(10 * tauxHoraireAttendu * 1.25, 5)
  })
})

describe('POST /paie/migrate — réservé aux admins depuis la Phase 0', () => {
  test('401 sans token (route à l\'origine de l\'incident P1 du 14/15 août 2024)', async () => {
    const res = await request(app).post('/paie/migrate')
    expect(res.status).toBe(401)
    expect(pool.query).not.toHaveBeenCalled()
  })

  test('403 avec un token valide mais non-admin', async () => {
    const res = await request(app).post('/paie/migrate').set('Authorization', `Bearer ${makeToken('user')}`)
    expect(res.status).toBe(403)
    expect(pool.query).not.toHaveBeenCalled()
  })

  test('200 avec un token admin', async () => {
    pool.query.mockResolvedValue({})
    const res = await request(app).post('/paie/migrate').set('Authorization', `Bearer ${makeToken('admin')}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

describe('GET /health', () => {
  it('retourne 200 et status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})
