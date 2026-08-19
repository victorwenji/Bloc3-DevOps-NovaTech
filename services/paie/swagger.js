const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Paie Service - HRFlow',
      version: '1.0.0',
      description: `
        Service de gestion des bulletins de paie pour HRFlow.
        Ce service permet de calculer les salaires, les cotisations,
        et de gérer les migrations de la base de données.
      `,
      contact: {
        name: 'Équipe HRFlow',
        email: 'support@hrflow.novatech.io',
      },
    },
    servers: [
      {
        url: 'http://localhost:3002',
        description: 'Serveur local (développement)',
      },
      {
        url: 'https://paie.hrflow.novatech.io',
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
        // Schéma pour la requête de calcul de paie
        CalculerPaieRequest: {
          type: 'object',
          required: ['employeeId', 'mois', 'annee'],
          properties: {
            employeeId: {
              type: 'integer',
              description: 'ID de l\'employé',
              example: 1,
            },
            mois: {
              type: 'integer',
              minimum: 1,
              maximum: 12,
              description: 'Mois pour lequel calculer la paie',
              example: 8,
            },
            annee: {
              type: 'integer',
              description: 'Année pour laquelle calculer la paie',
              example: 2026,
            },
          },
        },
        // Schéma pour la réponse de calcul de paie
        BulletinPaie: {
          type: 'object',
          properties: {
            employeeId: {
              type: 'integer',
              description: 'ID de l\'employé',
              example: 1,
            },
            mois: {
              type: 'integer',
              description: 'Mois du bulletin',
              example: 8,
            },
            annee: {
              type: 'integer',
              description: 'Année du bulletin',
              example: 2026,
            },
            brut: {
              type: 'number',
              description: 'Salaire brut mensuel',
              example: 3000.0,
            },
            cotisationsSalariales: {
              type: 'number',
              description: 'Montant des cotisations salariales',
              example: 660.0,
            },
            cotisationsPatronales: {
              type: 'number',
              description: 'Montant des cotisations patronales',
              example: 1260.0,
            },
            net: {
              type: 'number',
              description: 'Salaire net mensuel',
              example: 2340.0,
            },
            generatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Date de génération du bulletin',
            },
          },
        },
        // Schéma pour la requête de calcul des heures supplémentaires
        HeuresSupRequest: {
          type: 'object',
          required: ['employeeId', 'heures'],
          properties: {
            employeeId: {
              type: 'integer',
              description: 'ID de l\'employé',
              example: 1,
            },
            heures: {
              type: 'number',
              description: 'Nombre d\'heures supplémentaires',
              example: 10,
            },
          },
        },
        // Schéma pour la réponse de calcul des heures supplémentaires
        HeuresSupResponse: {
          type: 'object',
          properties: {
            heures: {
              type: 'number',
              description: 'Nombre d\'heures supplémentaires',
              example: 10,
            },
            tauxHoraire: {
              type: 'number',
              description: 'Taux horaire de l\'employé',
              example: 20.0,
            },
            majorationHeuresSup: {
              type: 'number',
              description: 'Montant de la majoration pour les heures supplémentaires',
              example: 250.0,
            },
            total: {
              type: 'number',
              description: 'Total à payer pour les heures supplémentaires',
              example: 250.0,
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
    customSiteTitle: 'Paie Service - HRFlow',
  }));
};