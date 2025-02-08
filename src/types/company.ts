import { Type } from '@fastify/type-provider-typebox';

// Schemat dla współrzędnych geograficznych
export const LatLngSchema = Type.Object({
  lat: Type.Number(),
  lng: Type.Number()
});

export type LatLngLiteral = typeof LatLngSchema.static;

export const CompanySchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String({ minLength: 2 }),
  description: Type.Optional(Type.String()),
  address: Type.String(),
  coordinates: LatLngSchema,
  services: Type.Array(Type.String()),
  prices: Type.Object({
    basePrice: Type.Number(),
    pricePerHour: Type.Number(),
    minimumHours: Type.Optional(Type.Number())
  }),
  contact: Type.Object({
    phone: Type.Optional(Type.String()),
    email: Type.Optional(Type.String()),
    website: Type.Optional(Type.String())
  }),
  rating: Type.Optional(Type.Number({ minimum: 0, maximum: 5 })),
  review_count: Type.Optional(Type.Number({ minimum: 0 })),
  created_at: Type.String({ format: 'date-time' }),
  updated_at: Type.String({ format: 'date-time' })
});

export const CompanyListSchema = Type.Array(CompanySchema);

export const CompanySearchParamsSchema = Type.Object({
  query: Type.Optional(Type.String()),
  services: Type.Optional(Type.Array(Type.String())),
  priceMin: Type.Optional(Type.Number()),
  priceMax: Type.Optional(Type.Number()),
  rating: Type.Optional(Type.Number()),
  location: Type.Optional(Type.String()),
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 }))
});

export type Company = typeof CompanySchema.static;
export type CompanySearchParams = typeof CompanySearchParamsSchema.static;

// Schemat dla firmy z informacją o odległości
export const CompanyWithDistanceSchema = Type.Intersect([
  CompanySchema,
  Type.Object({
    distance_km: Type.Optional(Type.Number())
  })
]);

export type CompanyWithDistance = typeof CompanyWithDistanceSchema.static;

// Schemat dla tworzenia nowej firmy (bez id, created_at, updated_at)
export const CreateCompanySchema = Type.Omit(CompanySchema, [
  'id',
  'created_at',
  'updated_at',
  'rating',
  'review_count'
]);
