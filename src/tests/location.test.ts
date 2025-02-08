import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from '@/app';
import type { FastifyInstance } from 'fastify';
import { LatLngLiteral } from '../types/company';

describe('filtrowanie firm po lokalizacji', () => {




  afterAll(async () => {


    it('powinno zwrócić firmy w zadanym promieniu', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/companies',
        query: {
          location: JSON.stringify({
            lat: 52.23,
            lng: 21.01,
            radius: 10
          })
        }
      });
    
      expect(response.statusCode).toBe(200);
      
      // Sprawdź czy mockowany Supabase został wywołany
      expect(app.supabase.rpc).toHaveBeenCalledWith('nearby_companies', {
        lat: expect.any(Number),
        lng: expect.any(Number),
        radius: expect.any(Number)
      });
      
      const result = JSON.parse(response.body);
      expect(result.data[0].distance_km).toBe(5.2);
    });

  it('powinno zwrócić pustą listę dla lokalizacji bez firm', async () => {
    // Współrzędne gdzieś na Antarktydzie
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/companies',
      query: {
        location: JSON.stringify({
          lat: -82.862752,
          lng: 135.000000,
          radius: 5
        })
      }
    });

    expect(response.statusCode).toBe(200);
    
    const result = JSON.parse(response.payload);
    expect(result.data.length).toBe(0);
    expect(result.pagination.total).toBe(0);
  });

  it('powinno zwrócić błąd dla niepoprawnych parametrów lokalizacji', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/companies',
      query: {
        location: JSON.stringify({
          lat: 'invalid',
          lng: 21.017532,
          radius: 10
        })
      }
    });

    expect(response.statusCode).toBe(400);
  });
});