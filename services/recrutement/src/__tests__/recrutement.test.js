jest.mock('pg', () => {
  const query = jest.fn()
  return { Pool: jest.fn(() => ({ query })) }
})

// multer mocké : on ne teste pas ici l'écriture disque (aucune validation de
// type/taille actuellement — voir docs/audit-J1-equipe-entrante.md, hors
// périmètre de ce plan), seulement le contrat HTTP de la route.
jest.mock('multer', () => {
  const multerMock = () => ({
    single: () => (req, res, next) => {
      req.file = { originalname: 'cv.pdf', path: '/tmp/uploads/cv.pdf' }
      next()
    }
  })
  multerMock.diskStorage = () => ({})
  return multerMock
})

const request = require('supertest')
const { Pool } = require('pg')
const app = require('../index')

const pool = new Pool()

beforeEach(() => {
  pool.query.mockReset()
})

describe('POST /recrutement/candidat', () => {
  test('crée un candidat avec le chemin du CV uploadé', async () => {
    const candidat = { id: 1, nom: 'Dupont', prenom: 'Alice', email: 'alice@x.com', poste: 'Dev', cv_path: '/tmp/uploads/cv.pdf' }
    pool.query.mockResolvedValue({ rows: [candidat] })
    const res = await request(app).post('/recrutement/candidat').send({
      nom: 'Dupont', prenom: 'Alice', email: 'alice@x.com', poste: 'Dev'
    })
    expect(res.status).toBe(200)
    expect(res.body).toEqual(candidat)
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO candidats'),
      ['Dupont', 'Alice', 'alice@x.com', 'Dev', '/tmp/uploads/cv.pdf']
    )
  })
})

describe('GET /recrutement/candidats', () => {
  test('renvoie la liste des candidats', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, nom: 'Dupont' }] })
    const res = await request(app).get('/recrutement/candidats')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: 1, nom: 'Dupont' }])
  })
})

describe('PATCH /recrutement/candidat/:id/statut', () => {
  test('met à jour le statut du candidat', async () => {
    pool.query.mockResolvedValue({})
    const res = await request(app).patch('/recrutement/candidat/1/statut').send({ statut: 'entretien' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(pool.query).toHaveBeenCalledWith('UPDATE candidats SET statut = $1 WHERE id = $2', ['entretien', '1'])
  })
})

describe('GET /health', () => {
  it('retourne 200 et status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})