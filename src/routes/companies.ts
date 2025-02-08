import { FastifyPluginAsync } from 'fastify';
import { Type } from '@fastify/type-provider-typebox';
import {
  Company,
  CompanySchema,
  CompanyListSchema,
  CompanySearchParamsSchema,
  CreateCompanySchema,
  CompanyWithDistanceSchema
} from '../types/company';
import { searchCompanies } from '../services/companies';

const companies: FastifyPluginAsync = async (fastify) => {
  // Pobierz listę firm z możliwością filtrowania
  fastify.get<{
    Querystring: typeof CompanySearchParamsSchema.static
  }>('/companies', {
    schema: {
      tags: ['Companies'],
      description: 'Pobierz listę firm z możliwością filtrowania',
      querystring: CompanySearchParamsSchema,
      response: {
        200: Type.Object({
          data: Type.Array(CompanyWithDistanceSchema),
          pagination: Type.Object({
            total: Type.Number(),
            page: Type.Number(),
            limit: Type.Number(),
            pages: Type.Number(),
          }),
        }),
      },
    },
  }, async (request, reply) => {
    try {
      const { location: locationStr, ...params } = request.query;
      
      let location;
      if (locationStr) {
        try {
          const parsed = JSON.parse(locationStr as string);
          if (typeof parsed.lat === 'number' && 
              typeof parsed.lng === 'number' && 
              typeof parsed.radius === 'number') {
            location = parsed;
          } else {
            reply.code(400).send({
              error: 'ValidationError',
              message: 'Nieprawidłowy format parametrów lokalizacji',
              statusCode: 400
            });
            return;
          }
        } catch (error) {
          reply.code(400).send({
            error: 'ValidationError',
            message: 'Nieprawidłowy format JSON dla parametru location',
            statusCode: 400
          });
          return;
        }
      }

      const result = await searchCompanies(fastify, { ...params, location });
      return result;
    } catch (error) {
      fastify.log.error('Nieoczekiwany błąd:', error);
      reply.code(500).send({
        error: 'InternalServerError',
        message: 'Wystąpił nieoczekiwany błąd serwera',
        statusCode: 500
      });
    }
  });

  // Pobierz szczegóły firmy
  fastify.get<{
    Params: { id: string };
  }>('/companies/:id', {
    schema: {
      tags: ['Companies'],
      description: 'Pobierz szczegóły firmy',
      params: Type.Object({
        id: Type.String({ format: 'uuid' }),
      }),
      response: {
        200: CompanySchema,
        404: Type.Object({
          error: Type.String(),
          message: Type.String(),
          statusCode: Type.Number(),
        }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { data: company, error } = await fastify.supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !company) {
      reply.code(404).send({
        error: 'NotFound',
        message: 'Firma nie została znaleziona',
        statusCode: 404,
      });
      return;
    }

    return company;
  });

  // Dodaj nową firmę
  fastify.post<{
    Body: typeof CreateCompanySchema.static;
  }>('/companies', {
    schema: {
      tags: ['Companies'],
      description: 'Dodaj nową firmę',
      body: CreateCompanySchema,
      response: {
        201: CompanySchema,
        400: Type.Object({
          error: Type.String(),
          message: Type.String(),
          statusCode: Type.Number(),
        }),
      },
    },
  }, async (request, reply) => {
    const { data: newCompany, error } = await fastify.supabase
      .from('companies')
      .insert(request.body)
      .select()
      .single();

    if (error) {
      reply.code(400).send({
        error: 'ValidationError',
        message: error.message,
        statusCode: 400,
      });
      return;
    }

    reply.code(201).send(newCompany);
  });

  // Zaktualizuj firmę
  fastify.put<{
    Params: { id: string };
    Body: typeof CreateCompanySchema.static;
  }>('/companies/:id', {
    schema: {
      tags: ['Companies'],
      description: 'Zaktualizuj dane firmy',
      params: Type.Object({
        id: Type.String({ format: 'uuid' }),
      }),
      body: CreateCompanySchema,
      response: {
        200: CompanySchema,
        404: Type.Object({
          error: Type.String(),
          message: Type.String(),
          statusCode: Type.Number(),
        }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { data: company, error } = await fastify.supabase
      .from('companies')
      .update(request.body)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      reply.code(404).send({
        error: 'NotFound',
        message: 'Firma nie została znaleziona',
        statusCode: 404,
      });
      return;
    }

    return company;
  });

  // Usuń firmę
  fastify.delete<{
    Params: { id: string };
  }>('/companies/:id', {
    schema: {
      tags: ['Companies'],
      description: 'Usuń firmę',
      params: Type.Object({
        id: Type.String({ format: 'uuid' }),
      }),
      response: {
        204: Type.Null(),
        404: Type.Object({
          error: Type.String(),
          message: Type.String(),
          statusCode: Type.Number(),
        }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { error } = await fastify.supabase
      .from('companies')
      .delete()
      .eq('id', id);

    if (error) {
      reply.code(404).send({
        error: 'NotFound',
        message: 'Firma nie została znaleziona',
        statusCode: 404,
      });
      return;
    }

    reply.code(204).send();
  });
};

export default companies;