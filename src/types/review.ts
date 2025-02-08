import { Type } from '@fastify/type-provider-typebox';

export const ReviewSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  companyId: Type.String({ format: 'uuid' }),
  rating: Type.Number({
    minimum: 1,
    maximum: 5,
    description: 'Ocena w skali 1-5'
  }),
  content: Type.Optional(Type.String({
    minLength: 10,
    maxLength: 1000,
    description: 'Treść recenzji'
  })),
  author: Type.String({
    minLength: 2,
    maxLength: 50,
    description: 'Nazwa autora recenzji'
  }),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' })
});

export const ReviewListSchema = Type.Array(ReviewSchema);

export const CreateReviewSchema = Type.Omit(ReviewSchema, [
  'id',
  'createdAt',
  'updatedAt'
]);

export type Review = typeof ReviewSchema.static;
export type CreateReview = typeof CreateReviewSchema.static;