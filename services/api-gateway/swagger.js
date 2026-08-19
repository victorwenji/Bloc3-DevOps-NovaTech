const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const axios = require('axios');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Gateway - HRFlow',
      version: '1.0.0',
      description: `
        API Gateway pour les microservices HRFlow.
        Ce service sert de point d'entrée unique pour accéder aux services Auth, Paie, Congés et Recrutement.
      `,
      contact: {
        name: 'Équipe HRFlow',
        email: 'support@hrflow.novatech.io',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Serveur local (développement)',
      },
      {
        url: 'https://hrflow.novatech.io',
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
    },
  },
  // Chemin vers les fichiers contenant les commentaires JSDoc de l'API Gateway
  apis: ['./src/index.js'],
};

const specs = swaggerJsdoc(options);

// Fonction pour récupérer les spécifications Swagger d'un service
async function fetchSwaggerSpecs(serviceUrl) {
  try {
    const response = await axios.get(`${serviceUrl}/api-docs/json`);
    return response.data;
  } catch (error) {
    console.error(`Erreur lors de la récupération des specs pour ${serviceUrl}:`, error.message);
    return null;
  }
}

// Fusionner les spécifications de tous les services
async function mergeSpecs() {
  const authSpecs = await fetchSwaggerSpecs('http://auth:3001');
  const paieSpecs = await fetchSwaggerSpecs('http://paie:3002');
  const congesSpecs = await fetchSwaggerSpecs('http://conges:3003');
  const recrutementSpecs = await fetchSwaggerSpecs('http://recrutement:3004');

  // Fusionner les paths
  const mergedSpecs = { ...specs };
  mergedSpecs.paths = {
    ...(mergedSpecs.paths || {}),
    ...(authSpecs?.paths || {}),
    ...(paieSpecs?.paths || {}),
    ...(congesSpecs?.paths || {}),
    ...(recrutementSpecs?.paths || {}),
  };

  // Fusionner les composants (schemas, securitySchemes, etc.). Un simple spread des
  // objets `components` ne suffit pas : chaque service a son propre sous-objet
  // `schemas`, et spreader des `components` les uns après les autres REMPLACE ce
  // sous-objet à chaque fois au lieu de le fusionner (dernier arrivé = seul survivant,
  // ex. recrutement écrasait silencieusement les schémas de auth/paie/congés). Il faut
  // fusionner explicitement chaque sous-clé (`schemas`, `securitySchemes`).
  mergedSpecs.components = {
    ...(mergedSpecs.components || {}),
    ...(authSpecs?.components || {}),
    ...(paieSpecs?.components || {}),
    ...(congesSpecs?.components || {}),
    ...(recrutementSpecs?.components || {}),
    schemas: {
      ...(mergedSpecs.components?.schemas || {}),
      ...(authSpecs?.components?.schemas || {}),
      ...(paieSpecs?.components?.schemas || {}),
      ...(congesSpecs?.components?.schemas || {}),
      ...(recrutementSpecs?.components?.schemas || {}),
    },
    securitySchemes: {
      ...(mergedSpecs.components?.securitySchemes || {}),
      ...(authSpecs?.components?.securitySchemes || {}),
      ...(paieSpecs?.components?.securitySchemes || {}),
      ...(congesSpecs?.components?.securitySchemes || {}),
      ...(recrutementSpecs?.components?.securitySchemes || {}),
    },
  };

  // Fusionner les tags
  mergedSpecs.tags = [
    ...(mergedSpecs.tags || []),
    ...(authSpecs?.tags || []),
    ...(paieSpecs?.tags || []),
    ...(congesSpecs?.tags || []),
    ...(recrutementSpecs?.tags || []),
  ];

  // Fusionner les serveurs
  mergedSpecs.servers = [
    ...(mergedSpecs.servers || []),
    ...(authSpecs?.servers || []),
    ...(paieSpecs?.servers || []),
    ...(congesSpecs?.servers || []),
    ...(recrutementSpecs?.servers || []),
  ];

  return mergedSpecs;
}

module.exports = async (app) => {
  try {
    const mergedSpecs = await mergeSpecs();
    // Doit être déclarée avant le app.use('/api-docs', ...) ci-dessous : le
    // middleware swaggerUi.setup() intercepte toute requête sous /api-docs
    // (y compris /api-docs/json) et sert la page HTML, Express matchant les
    // routes dans l'ordre d'enregistrement (même piège que dans les swagger.js
    // des autres services).
    app.get('/api-docs/json', (req, res) => res.json(mergedSpecs));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(mergedSpecs, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'API Gateway - HRFlow',
    }));
  } catch (error) {
    console.error('Erreur lors de la configuration de Swagger:', error);
  }
};