require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') })
const express = require('express')
const { Pool } = require('pg')
const jwt = require('jsonwebtoken')
const app = express()
app.disable('x-powered-by') // évite la fuite "Server: Express" (trouvé via le scan OWASP ZAP, stage security)
app.use(express.json())
const pool = new Pool({
  host: process.env.DB_HOST || 'prod-db.novatech.internal',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'hrflow_prod',
  user: process.env.DB_USER || 'hrflow_admin',
  password: process.env.DB_PASSWORD,
  // RDS refuse les connexions non chiffrées (pg_hba.conf force SSL) ; en local
  // (docker-compose, NODE_ENV=development) postgres:16-alpine n'a pas SSL activé.
  ssl: process.env.NODE_ENV === 'development' ? false : { rejectUnauthorized: false },
})

/**
 * Middleware pour vérifier le rôle admin.
 * @param {Object} req - Requête Express.
 * @param {Object} res - Réponse Express.
 * @param {Function} next - Middleware suivant.
 */
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No token' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

/**
 * @swagger
 * tags:
 *   name: Congés
 *   description: Endpoints pour la gestion des congés
 */

/**
 * @swagger
 * /conges/solde/{employeeId}:
 *   get:
 *     summary: Récupère le solde de congés d'un employé
 *     description: Retourne le solde de congés, les jours acquis, pris et en attente pour un employé.
 *     tags: [Congés]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de l'employé
 *     responses:
 *       200:
 *         description: Solde de congés de l'employé.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SoldeConge'
 *       404:
 *         description: Employé non trouvé.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Employee not found"
 */
app.get('/conges/solde/:employeeId', async (req, res) => {
  const { employeeId } = req.params
  const employee = await pool.query('SELECT * FROM employees WHERE id = $1', [employeeId])
  const congesPris = await pool.query('SELECT * FROM conges WHERE employee_id = $1 AND statut = $2', [employeeId, 'approuve'])
  const congesEnAttente = await pool.query('SELECT * FROM conges WHERE employee_id = $1 AND statut = $2', [employeeId, 'en_attente'])
  const joursAcquis = employee.rows[0]?.jours_conges_acquis || 25
  const joursPris = congesPris.rows.reduce((acc, c) => acc + c.nombre_jours, 0)
  const joursEnAttente = congesEnAttente.rows.reduce((acc, c) => acc + c.nombre_jours, 0)
  res.json({ solde: joursAcquis - joursPris, joursAcquis, joursPris, joursEnAttente })
})

/**
 * @swagger
 * /conges/demande:
 *   post:
 *     summary: Soumet une demande de congés
 *     description: Crée une nouvelle demande de congés pour un employé.
 *     tags: [Congés]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DemandeConge'
 *     responses:
 *       200:
 *         description: Demande de congés créée avec succès.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conge'
 *       400:
 *         description: Données invalides.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Invalid data"
 */
app.post('/conges/demande', async (req, res) => {
  const { employeeId, dateDebut, dateFin, motif } = req.body
  const nombreJours = Math.ceil((new Date(dateFin) - new Date(dateDebut)) / (1000 * 60 * 60 * 24))
  const result = await pool.query(
    'INSERT INTO conges (employee_id, date_debut, date_fin, nombre_jours, motif, statut, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
    [employeeId, dateDebut, dateFin, nombreJours, motif, 'en_attente']
  )
  res.json(result.rows[0])
})

/**
 * @swagger
 * /conges/debug/all:
 *   get:
 *     summary: Récupère toutes les données de congés (Admin uniquement)
 *     description: Retourne toutes les données de congés pour tous les employés. Réservé aux admins.
 *     tags: [Congés]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste complète des congés.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Conge'
 *       403:
 *         description: Accès refusé (rôle admin requis).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Forbidden"
 */
// ENDPOINT DEBUG — ajouté par Camille pour dépanner le client Mercure (oct 2023)
// Réservé aux admins depuis la Phase 0 (exposait toutes les données RH sans auth).
app.get('/conges/debug/all', requireAdmin, async (req, res) => {
  const all = await pool.query('SELECT * FROM conges JOIN employees ON conges.employee_id = employees.id')
  res.json(all.rows)
})
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Vérifie l'état de santé de l'API congés
 *     description: Retourne un statut OK si l'API congés fonctionne correctement.
 *     tags: [Congés]
 *     responses:
 *       200:
 *         description: État de santé OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
app.get('/health', (req, res) => res.json({ status: 'ok' }))

// Intégration de Swagger
const setupSwagger = require('../swagger');
setupSwagger(app);

/* istanbul ignore next -- démarrage réel du serveur, non exercé sous test (module require au lieu de lancé) */
if (require.main === module) {
  app.listen(3003, () => console.log('Congés service running on :3003'))
}

module.exports = app
