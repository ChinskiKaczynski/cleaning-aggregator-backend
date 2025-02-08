import { vi } from 'vitest';
import type { RedisClientType } from 'redis';
import type { SupabaseClient, PostgrestResponse, PostgrestError } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import type { CompanyWithDistance } from '../types/company';

// Mock dla Redis
export const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  quit: vi.fn(),
  on: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  isOpen: false,
  isReady: false
} as unknown as RedisClientType;

// Funkcja tworząca mocka dla Supabase
export const createMockSupabase = () => {
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: null,
      error: null
    }),
    maybeSingle: vi.fn().mockResolvedValue({
      data: null,
      error: null
    })
  };

  return {
    from: vi.fn().mockReturnValue(queryBuilder),
    rpc: vi.fn(),
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockReturnValue(null)
    },
    // Wymagane pola dla SupabaseClient
    supabaseUrl: 'http://localhost:54321',
    supabaseKey: 'test-key',
    realtime: {
      connect: vi.fn(),
      disconnect: vi.fn()
    },
    removeAllChannels: vi.fn(),
    removeChannel: vi.fn(),
    removeAllSubscriptions: vi.fn(),
    removeSubscription: vi.fn(),
    getChannels: vi.fn().mockReturnValue([])
  } as unknown as SupabaseClient<Database>;
};

export const mockSupabase = createMockSupabase();

// Mock dla odpowiedzi z find_companies_in_radius
export const mockCompanyWithDistance: CompanyWithDistance = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Test Company 1',
  description: 'Test company near Warsaw',
  address: 'ul. Testowa 1, Warszawa',
  coordinates: {
    lat: 52.237049,
    lng: 21.017532
  },
  services: ['sprzątanie', 'mycie okien'],
  prices: {
    basePrice: 100,
    pricePerHour: 50,
    minimumHours: 2
  },
  contact: {
    phone: '123456789',
    email: 'test@example.com'
  },
  rating: 4.5,
  review_count: 10,
  created_at: '2025-02-08T06:00:00Z',
  updated_at: '2025-02-08T06:00:00Z',
  distance_km: 5.2
};

// Mock dla odpowiedzi z find_companies_in_radius dla pustej lokalizacji
export const mockEmptyLocationResponse: PostgrestResponse<CompanyWithDistance> = {
  data: [],
  error: null,
  count: 0,
  status: 200,
  statusText: 'OK'
};

// Mock dla błędnej odpowiedzi
export const mockErrorResponse: PostgrestResponse<CompanyWithDistance> = {
  data: null,
  error: {
    message: 'Invalid parameters',
    details: '',
    hint: '',
    code: 'INVALID_PARAMETERS',
    name: 'PostgrestError'
  } as PostgrestError,
  count: null,
  status: 400,
  statusText: 'Bad Request'
};
