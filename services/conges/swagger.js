const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Congés Service - HRFlow',
      version: '1.0.0',
      description: `
        Service de gestion des congés pour HRFlow.
        Ce service permet de gérer les demandes de congés, de consulter les soldes,
        et de récupérer toutes les données de congés (pour les admins).
      `,
      contact: {
        name: 'Équipe HRFlow',
        email: 'support@hrflow.novatech.io',
      },
    },
    servers: [
      {
        url: 'http://localhost:3003',
        description: 'Serveur local (développement)',
      },
      {
        url: 'https://conges.hrflow.novatech.io',
        description: 'Serveur de production',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT requis pour accéder aux endpoints protégés.',
        },
      },
      schemas: {
        // Schéma pour une demande de congés
        DemandeConge: {
          type: 'object',
          required: ['employeeId', 'dateDebut', 'dateFin', 'motif'],
          properties: {
            employeeId: {
              type: 'integer',
              description: 'ID de l\'employé',
              example: 1,
            },
            dateDebut: {
              type: 'string',
              format: 'date',
              description: 'Date de début des congés',
              example: '2026-08-15',
            },
            dateFin: {
              type: 'string',
              format: 'date',
              description: 'Date de fin des congés',
              example: '2026-08-20',
            },
            motif: {
              type: 'string',
              description: 'Motif des congés',
              example: 'Congés payés',
            },
          },
        },
        // Schéma pour un congé
        Conge: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'ID unique du congé',
              example: 1,
            },
            employee_id: {
              type: 'integer',
              description: 'ID de l\'employé',
              example: 1,
            },
            date_debut: {
              type: 'string',
              format: 'date',
              description: 'Date de début des congés',
              example: '2026-08-15',
            },
            date_fin: {
              type: 'string',
              format: 'date',
              description: 'Date de fin des congés',
              example: '2026-08-20',
            },
            nombre_jours: {
              type: 'integer',
              description: 'Nombre de jours de congés',
              example: 5,
            },
            motif: {
              type: 'string',
              description: 'Motif des congés',
              example: 'Congés payés',
            },
            statut: {
              type: 'string',
              enum: ['en_attente', 'approuve', 'refuse'],
              description: 'Statut de la demande de congés',
              example: 'en_attente',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Date de création de la demande',
            },
          },
        },
        // Schéma pour le solde de congés
        SoldeConge: {
          type: 'object',
          properties: {
            solde: {
              type: 'integer',
              description: 'Solde restant de jours de congés',
              example: 20,
            },
            joursAcquis: {
              type: 'integer',
              description: 'Nombre total de jours de congés acquis',
              example: 25,
            },
            joursPris: {
              type: 'integer',
              description: 'Nombre de jours de congés déjà pris',
              example: 5,
            },
            joursEnAttente: {
              type: 'integer',
              description: 'Nombre de jours de congés en attente de validation',
              example: 0,
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
              example: 'Employee not found',
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
    customSiteTitle: 'Congés Service - HRFlow',
  }));
};