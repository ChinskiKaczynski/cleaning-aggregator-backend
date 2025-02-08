import { FastifyInstance, FastifyRequest } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const reviewSchema = z.object({
  authorName: z.string().min(2).max(100),
  rating: z.number().int().min(1).max(5),
  content: z.string().min(10).max(1000),
});

interface Review {
  id: string;
  author_name: string;
  rating: number;
  content: string;
  created_at: string;
  updated_at: string;
}

interface DBFunctions {
  calculate_company_rating: number;
  count_company_reviews: number;
}

export default async function reviewsRoutes(fastify: FastifyInstance) {
  const db = fastify.supabase as SupabaseClient;

  // Pobierz opinie dla firmy
  fastify.get<{
    Params: { companyId: string };
    Reply: {
      reviews: {
        id: string;
        authorName: string;
        rating: number;
        content: string;
        createdAt: string;
        updatedAt: string;
      }[];
      rating: {
        averageRating: number;
        totalReviews: number;
      };
    };
  }>('/companies/:companyId/reviews', async (request, reply) => {
    const { companyId } = request.params;

    try {
      // Pobierz opinie
      const { data: reviews, error: reviewsError } = await db
        .from('reviews')
        .select('id, author_name, rating, content, created_at, updated_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (reviewsError) throw reviewsError;

      // Pobierz średnią ocenę
      const { data: avgRating, error: avgError } = await db
        .rpc<keyof DBFunctions>('calculate_company_rating', [companyId]);

      if (avgError) throw avgError;

      const { data: reviewCount, error: countError } = await db
        .rpc<keyof DBFunctions>('count_company_reviews', [companyId]);

      if (countError) throw countError;

      return {
        reviews: (reviews as Review[]).map(review => ({
          id: review.id,
          authorName: review.author_name,
          rating: review.rating,
          content: review.content,
          createdAt: review.created_at,
          updatedAt: review.updated_at
        })),
        rating: {
          averageRating: avgRating?.[0]?.calculate_company_rating || 0,
          totalReviews: reviewCount?.[0]?.count_company_reviews || 0
        }
      };
    } catch (error) {
      fastify.log.error(error);
      throw new Error('Nie udało się pobrać opinii');
    }
  });

  // Dodaj nową opinię
  fastify.post<{
    Params: { companyId: string };
    Body: z.infer<typeof reviewSchema>;
  }>('/companies/:companyId/reviews', async (request, reply) => {
    const { companyId } = request.params;

    try {
      // Walidacja danych
      const validatedData = reviewSchema.parse(request.body);

      // Sprawdź czy firma istnieje
      const { data: company, error: companyError } = await db
        .from('companies')
        .select('id')
        .eq('id', companyId)
        .single();

      if (companyError || !company) {
        reply.code(404);
        throw new Error('Firma nie istnieje');
      }

      // Dodaj opinię
      const { data: review, error: insertError } = await db
        .from('reviews')
        .insert({
          company_id: companyId,
          author_name: validatedData.authorName,
          rating: validatedData.rating,
          content: validatedData.content
        })
        .select()
        .single();

      if (insertError || !review) {
        throw insertError || new Error('Nie udało się dodać opinii');
      }

      // Pobierz zaktualizowaną średnią ocenę
      const { data: avgRating } = await db
        .rpc<keyof DBFunctions>('calculate_company_rating', [companyId]);

      const { data: reviewCount } = await db
        .rpc<keyof DBFunctions>('count_company_reviews', [companyId]);

      reply.code(201);
      return {
        review: {
          id: review.id,
          authorName: review.author_name,
          rating: review.rating,
          content: review.content,
          createdAt: review.created_at,
          updatedAt: review.updated_at
        },
        rating: {
          averageRating: avgRating?.[0]?.calculate_company_rating || 0,
          totalReviews: reviewCount?.[0]?.count_company_reviews || 0
        }
      };
    } catch (error) {
      fastify.log.error(error);
      if (error instanceof z.ZodError) {
        reply.code(400);
        throw new Error('Nieprawidłowe dane opinii');
      }
      throw new Error('Nie udało się dodać opinii');
    }
  });
}