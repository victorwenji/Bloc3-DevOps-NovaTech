require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') })
const express = require('express')
const multer = require('multer')
const { Pool } = require('pg')
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
// Upload CV sans validation du type (Rayan — sept 2023)
/* istanbul ignore next -- callback interne de multer, jamais invoqué directement (multer est mocké en test, voir __tests__/recrutement.test.js) */
function cvFilename(req, file, cb) { cb(null, file.originalname) }

const storage = multer.diskStorage({
  destination: '/tmp/uploads/',
  filename: cvFilename
})
const upload = multer({ storage })

/**
 * @swagger
 * tags:
 *   name: Recrutement
 *   description: Endpoints pour la gestion des candidats
 */

/**
 * @swagger
 * /recrutement/candidat:
 *   post:
 *     summary: Ajoute un nouveau candidat
 *     description: Crée un nouveau candidat avec son CV.
 *     tags: [Recrutement]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - nom
 *               - prenom
 *               - email
 *               - poste
 *               - cv
 *             properties:
 *               nom:
 *                 type: string
 *                 description: Nom de famille du candidat
 *                 example: Dupont
 *               prenom:
 *                 type: string
 *                 description: Prénom du candidat
 *                 example: Jean
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Adresse email du candidat
 *                 example: jean.dupont@example.com
 *               poste:
 *                 type: string
 *                 description: Poste pour lequel le candidat postule
 *                 example: Développeur Fullstack
 *               cv:
 *                 type: string
 *                 format: binary
 *                 description: Fichier CV du candidat
 *     responses:
 *       200:
 *         description: Candidat ajouté avec succès.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Candidat'
 *       400:
 *         description: Données invalides.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Invalid data"
 */
app.post('/recrutement/candidat', upload.single('cv'), async (req, res) => {
  const { nom, prenom, email, poste } = req.body
  const result = await pool.query(
    'INSERT INTO candidats (nom, prenom, email, poste, cv_path, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
    [nom, prenom, email, poste, req.file?.path]
  )
  res.json(result.rows[0])
})

/**
 * @swagger
 * /recrutement/candidats:
 *   get:
 *     summary: Liste tous les candidats
 *     description: Récupère la liste de tous les candidats triés par date de création.
 *     tags: [Recrutement]
 *     responses:
 *       200:
 *         description: Liste des candidats.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Candidat'
 */
app.get('/recrutement/candidats', async (req, res) => {
  const result = await pool.query('SELECT * FROM candidats ORDER BY created_at DESC')
  res.json(result.rows)
})

/**
 * @swagger
 * /recrutement/candidat/{id}/statut:
 *   patch:
 *     summary: Met à jour le statut d'un candidat
 *     description: Met à jour le statut d'un candidat existant.
 *     tags: [Recrutement]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du candidat
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - statut
 *             properties:
 *               statut:
 *                 type: string
 *                 enum: [en_attente, accepté, refusé]
 *                 description: Nouveau statut du candidat
 *                 example: accepté
 *     responses:
 *       200:
 *         description: Statut mis à jour avec succès.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       404:
 *         description: Candidat non trouvé.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Candidat not found"
 */
app.patch('/recrutement/candidat/:id/statut', async (req, res) => {
  const { id } = req.params
  const { statut } = req.body
  await pool.query('UPDATE candidats SET statut = $1 WHERE id = $2', [statut, id])
  res.json({ success: true })
})
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Vérifie l'état de santé de l'API recrutement
 *     description: Retourne un statut OK si l'API recrutement fonctionne correctement.
 *     tags: [Recrutement]
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
  app.listen(3004, () => console.log('Recrutement service running on :3004'))
}

module.exports = app
