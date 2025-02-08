import { FastifyPluginAsync } from 'fastify';
import companies from './companies';
import reviews from './reviews';
import health from './health';

const routes: FastifyPluginAsync = async (fastify) => {
  // Endpoint zdrowia aplikacji
  await fastify.register(health);

  // Rejestracja routes dla firm i recenzji
  await fastify.register(companies, { prefix: '/api/v1' });
  await fastify.register(reviews, { prefix: '/api/v1' });
};

export default routes;