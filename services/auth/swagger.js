const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

/**
 * Configuration de Swagger pour le service Auth.
 * Les commentaires JSDoc dans app.js seront utilisés pour générer la documentation.
 */
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Auth Service - HRFlow',
      version: '1.0.0',
      description: `
        Service d'authentification pour HRFlow.
        Ce service gère la connexion des utilisateurs, la génération de tokens JWT,
        et la vérification des tokens.
      `,
      contact: {
        name: 'Équipe HRFlow',
        email: 'support@hrflow.novatech.io',
      },
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Serveur local (développement)',
      },
      {
        url: 'https://auth.hrflow.novatech.io',
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
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'ID unique de l\'utilisateur',
              example: 1,
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Adresse email de l\'utilisateur',
              example: 'user@example.com',
            },
            role: {
              type: 'string',
              enum: ['admin', 'employee', 'rh'],
              description: 'Rôle de l\'utilisateur',
              example: 'employee',
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'Adresse email de l\'utilisateur',
              example: 'user@example.com',
            },
            password: {
              type: 'string',
              format: 'password',
              description: 'Mot de passe de l\'utilisateur',
              example: 'securePassword123',
            },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              description: 'Token JWT généré pour l\'utilisateur',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            user: {
              $ref: '#/components/schemas/User',
            },
          },
        },
        VerifyTokenRequest: {
          type: 'object',
          required: ['token'],
          properties: {
            token: {
              type: 'string',
              description: 'Token JWT à vérifier',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
          },
        },
        VerifyTokenResponse: {
          type: 'object',
          properties: {
            valid: {
              type: 'boolean',
              description: 'Indique si le token est valide',
              example: true,
            },
            user: {
              $ref: '#/components/schemas/User',
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Message d\'erreur',
              example: 'Invalid credentials',
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
  // Middleware pour servir Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    customCss: '.swagger-ui .topbar { display: none }', // Masque la barre supérieure
    customSiteTitle: 'Auth Service - HRFlow',
  }));
};