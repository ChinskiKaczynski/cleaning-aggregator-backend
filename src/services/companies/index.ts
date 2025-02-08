import type { FastifyInstance } from 'fastify';
import type { Company, CompanyWithDistance } from '../../types/company';

interface LocationParams {
  lat: number;
  lng: number;
  radius: number;
}

export interface CompanySearchParams {
  query?: string;
  services?: string[];
  priceMin?: number;
  priceMax?: number;
  rating?: number;
  location?: LocationParams;
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export async function searchCompanies(
  fastify: FastifyInstance,
  params: CompanySearchParams
): Promise<PaginatedResponse<CompanyWithDistance>> {
  const { query, services, priceMin, priceMax, rating, location } = params;
  const page = params.page || 1;
  const limit = params.limit || 20;

  // Jeśli mamy lokalizację, używamy funkcji find_companies_in_radius
  if (location) {
    fastify.log.info('Szukanie firm w lokalizacji:', location);
    
    const { data: nearbyCompanies, error: locationError } = await fastify.supabase
      .rpc('find_companies_in_radius', {
        lat: location.lat,
        lng: location.lng,
        radius_km: location.radius,
        results_limit: limit
      });

    if (locationError) {
      fastify.log.error('Błąd wyszukiwania po lokalizacji:', locationError);
      throw new Error(`Błąd podczas wyszukiwania firm w okolicy: ${locationError.message}`);
    }

    fastify.log.info('Znalezione firmy w okolicy:', nearbyCompanies);

    // Filtrowanie wyników lokalizacji
    let filteredCompanies = nearbyCompanies || [] as CompanyWithDistance[];

    if (query) {
      filteredCompanies = filteredCompanies.filter((c: CompanyWithDistance) => 
        c.name.toLowerCase().includes(query.toLowerCase()));
    }

    if (services && services.length > 0) {
      filteredCompanies = filteredCompanies.filter((c: CompanyWithDistance) =>
        services.every(s => c.services.includes(s)));
    }

    if (priceMin !== undefined) {
      filteredCompanies = filteredCompanies.filter((c: CompanyWithDistance) =>
        c.prices.basePrice >= priceMin);
    }

    if (priceMax !== undefined) {
      filteredCompanies = filteredCompanies.filter((c: CompanyWithDistance) =>
        c.prices.basePrice <= priceMax);
    }

    if (rating !== undefined) {
      filteredCompanies = filteredCompanies.filter((c: CompanyWithDistance) =>
        (c.rating || 0) >= rating);
    }

    // Paginacja wyników
    const total = filteredCompanies.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedCompanies = filteredCompanies.slice(start, end);

    return {
      data: paginatedCompanies,
      pagination: {
        total,
        page,
        limit,
        pages: totalPages,
      },
    };
  }

  // Jeśli nie ma lokalizacji, używamy standardowego zapytania
  let companiesQuery = fastify.supabase
    .from('companies')
    .select('*', { count: 'exact' });

  if (query) {
    companiesQuery = companiesQuery.textSearch('name', query);
  }

  if (services && services.length > 0) {
    companiesQuery = companiesQuery.contains('services', services);
  }

  if (priceMin !== undefined) {
    companiesQuery = companiesQuery.gte('prices->basePrice', priceMin);
  }
  if (priceMax !== undefined) {
    companiesQuery = companiesQuery.lte('prices->basePrice', priceMax);
  }

  if (rating !== undefined) {
    companiesQuery = companiesQuery.gte('rating', rating);
  }

  // Paginacja
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  companiesQuery = companiesQuery.range(from, to);

  const { data: companies, count, error } = await companiesQuery;

  if (error) {
    fastify.log.error('Błąd pobierania firm:', error);
    throw new Error(`Błąd podczas pobierania firm: ${error.message}`);
  }

  const totalPages = Math.ceil((count || 0) / limit);

  fastify.log.info('Zwracane firmy:', {
    count,
    companies,
    pagination: {
      total: count || 0,
      page,
      limit,
      pages: totalPages,
    }
  });

  return {
    data: companies || [],
    pagination: {
      total: count || 0,
      page,
      limit,
      pages: totalPages,
    },
  };
}