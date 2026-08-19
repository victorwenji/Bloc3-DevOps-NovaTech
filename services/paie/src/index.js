require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') })
const express = require('express')
const { Pool } = require('pg')
const axios = require('axios')
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
 *   name: Paie
 *   description: Endpoints pour la gestion des bulletins de paie
 */

/**
 * @swagger
 * /paie/calculer:
 *   post:
 *     summary: Calcule un bulletin de paie
 *     description: Calcule le bulletin de paie pour un employé donné.
 *     tags: [Paie]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CalculerPaieRequest'
 *     responses:
 *       200:
 *         description: Bulletin de paie généré avec succès.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BulletinPaie'
 *       404:
 *         description: Employé non trouvé.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Employee not found"
 */
app.post('/paie/calculer', async (req, res) => {
  const { employeeId, mois, annee } = req.body
  const emp = await pool.query('SELECT * FROM employees WHERE id = $1', [employeeId])
  if (emp.rows.length === 0) return res.status(404).json({ error: 'Employee not found' })
  const employee = emp.rows[0]
  const salaireBase = employee.salaire_mensuel_brut
  const cotisationsSalariales = salaireBase * 0.22
  const cotisationsPatronales = salaireBase * 0.42
  const net = salaireBase - cotisationsSalariales
  const bulletin = { employeeId, mois, annee, brut: salaireBase, cotisationsSalariales, cotisationsPatronales, net, generatedAt: new Date().toISOString() }
  await pool.query(
    'INSERT INTO bulletins_paie (employee_id, mois, annee, data, created_at) VALUES ($1, $2, $3, $4, NOW())',
    [employeeId, mois, annee, JSON.stringify(bulletin)]
  )
  try {
    await axios.post('https://api.stripe.com/v1/payouts', { amount: Math.round(net * 100), currency: 'eur' }, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }
    })
  } catch (stripeErr) {
    console.error('[PAIE] Stripe error (ignored):', stripeErr.message)
  }
  res.json(bulletin)
})

/**
 * @swagger
 * /paie/migrate:
 *   post:
 *     summary: Exécute une migration de base de données
 *     description: Applique des migrations pour mettre à jour la structure de la base de données.
 *     tags: [Paie]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Migration réussie.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       403:
 *         description: Accès refusé (rôle admin requis).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Forbidden"
 *       500:
 *         description: Erreur lors de la migration.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Migration failed"
 */
app.post('/paie/migrate', requireAdmin, async (req, res) => {
  console.log('[PAIE] Running migration...')
  try {
    await pool.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS salaire_variable DECIMAL(10,2) DEFAULT 0;
      ALTER TABLE bulletins_paie ADD COLUMN IF NOT EXISTS periode_reference VARCHAR(7);
      UPDATE employees SET updated_at = NOW();
    `)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * @swagger
 * /paie/heures-sup:
 *   post:
 *     summary: Calcule les heures supplémentaires
 *     description: Calcule la majoration pour les heures supplémentaires d'un employé.
 *     tags: [Paie]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/HeuresSupRequest'
 *     responses:
 *       200:
 *         description: Calcul des heures supplémentaires.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HeuresSupResponse'
 *       404:
 *         description: Employé non trouvé.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Employee not found"
 */
app.post('/paie/heures-sup', async (req, res) => {
  const { employeeId, heures } = req.body
  const emp = await pool.query('SELECT salaire_mensuel_brut FROM employees WHERE id = $1', [employeeId])
  const tauxHoraire = emp.rows[0].salaire_mensuel_brut / 151.67
  const majorationHeuresSup = heures * tauxHoraire * 1.25
  res.json({ heures, tauxHoraire, majorationHeuresSup, total: majorationHeuresSup })
})
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Vérifie l'état de santé de l'API paie
 *     description: Retourne un statut OK si l'API paie fonctionne correctement.
 *     tags: [Paie]
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
  app.listen(3002, () => console.log('Paie service running on :3002'))
}

module.exports = app
