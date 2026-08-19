const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Recrutement Service - HRFlow',
      version: '1.0.0',
      description: `
        Service de gestion des candidats pour HRFlow.
        Ce service permet d'ajouter des candidats, de lister les candidats,
        et de mettre à jour leur statut.
      `,
      contact: {
        name: 'Équipe HRFlow',
        email: 'support@hrflow.novatech.io',
      },
    },
    servers: [
      {
        url: 'http://localhost:3004',
        description: 'Serveur local (développement)',
      },
      {
        url: 'https://recrutement.hrflow.novatech.io',
        description: 'Serveur de production',
      },
    ],
    components: {
      schemas: {
        // Schéma pour un candidat
        Candidat: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'ID unique du candidat',
              example: 1,
            },
            nom: {
              type: 'string',
              description: 'Nom de famille du candidat',
              example: 'Dupont',
            },
            prenom: {
              type: 'string',
              description: 'Prénom du candidat',
              example: 'Jean',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Adresse email du candidat',
              example: 'jean.dupont@example.com',
            },
            poste: {
              type: 'string',
              description: 'Poste pour lequel le candidat postule',
              example: 'Développeur Fullstack',
            },
            cv_path: {
              type: 'string',
              description: 'Chemin vers le fichier CV du candidat',
              example: '/tmp/uploads/cv_jean_dupont.pdf',
            },
            statut: {
              type: 'string',
              enum: ['en_attente', 'accepté', 'refusé'],
              description: 'Statut du candidat',
              example: 'en_attente',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Date de création du candidat',
            },
          },
        },
        // Schéma pour les erreurs
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Message d\'erreur',
              example: 'Candidat not found',
            },
          },
        },
      },
    },
  },
  // Chemin vers les fichiers contenant les commentaires JSDoc
  apis: ['./src/index.js'],
};

const specs = swaggerJsdoc(options);

module.exports = (app) => {
  // Doit être déclarée avant le app.use('/api-docs', ...) ci-dessous : le
  // middleware swaggerUi.setup() intercepte toute requête sous /api-docs
  // (y compris /api-docs/json) et sert la page HTML, Express matchant les
  // routes dans l'ordre d'enregistrement.
  // Spec brute, utilisée par l'API Gateway pour fusionner la doc de tous les services
  app.get('/api-docs/json', (req, res) => res.json(specs));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Recrutement Service - HRFlow',
  }));
};