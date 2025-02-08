import type { FastifyInstance } from 'fastify';
import { LatLngLiteral } from '../../types/company';
import { GeocodingService } from './geocoding';

let geocodingService: GeocodingService | null = null;

// Inicjalizacja serwisu geokodowania
export function initializeGeocoding(fastify: FastifyInstance): void {
  geocodingService = new GeocodingService(fastify);
}

// Zamknięcie serwisu geokodowania
export async function closeGeocoding(): Promise<void> {
  if (geocodingService) {
    await geocodingService.close();
    geocodingService = null;
  }
}

// Geokodowanie adresu
export async function geocodeAddress(address: string): Promise<LatLngLiteral | null> {
  if (!geocodingService) {
    throw new Error('Geocoding service not initialized');
  }
  return geocodingService.geocodeAddress(address);
}

// Pobranie statystyk geokodowania
export async function getGeocodingStats(): Promise<{
  dailyRequests: number;
  remainingRequests: number;
  lastRequestTime: number;
}> {
  if (!geocodingService) {
    throw new Error('Geocoding service not initialized');
  }
  return geocodingService.getStats();
}

// Funkcja do obliczania odległości między dwoma punktami (w kilometrach)
export function calculateDistance(
  point1: LatLngLiteral,
  point2: LatLngLiteral
): number {
  const R = 6371; // Promień Ziemi w kilometrach
  const lat1 = toRad(point1.lat);
  const lat2 = toRad(point2.lat);
  const deltaLat = toRad(point2.lat - point1.lat);
  const deltaLng = toRad(point2.lng - point1.lng);

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Konwersja stopni na radiany
function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// Funkcja do filtrowania firm po lokalizacji
export async function findCompaniesNearLocation(
  fastify: FastifyInstance,
  location: LatLngLiteral,
  radius: number = 10, // domyślny promień 10km
  limit: number = 20
): Promise<any[]> {
  try {
    // Używamy PostGIS do znalezienia firm w zadanym promieniu
    const { data: companies, error } = await fastify.supabase
      .rpc('find_companies_in_radius', {
        lat: location.lat,
        lng: location.lng,
        radius_km: radius,
        results_limit: limit
      });

    if (error) throw error;
    return companies;
  } catch (error) {
    fastify.log.error('Error finding companies near location:', error);
    throw error;
  }
}

// Funkcja do aktualizacji lokalizacji firmy
export async function updateCompanyLocation(
  fastify: FastifyInstance,
  companyId: string,
  location: LatLngLiteral
): Promise<void> {
  try {
    // Aktualizuj współrzędne w bazie danych
    const { error } = await fastify.supabase
      .from('companies')
      .update({
        coordinates: {
          lat: location.lat,
          lng: location.lng
        }
      })
      .eq('id', companyId);

    if (error) throw error;
  } catch (error) {
    fastify.log.error('Error updating company location:', error);
    throw error;
  }
}