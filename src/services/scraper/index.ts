import * as cheerio from 'cheerio';
import type { FastifyInstance } from 'fastify';
import type { Company } from '../../types/company';
import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import fetch from 'node-fetch';
import type { RequestInit } from 'node-fetch';
import { UserAgentRotator, ProxyRotator, type Proxy } from './agents';
import { HttpsProxyAgent } from 'https-proxy-agent';

interface ScrapingSource {
  name: string;
  url: string;
  selector: {
    company: string;
    name: string;
    address?: string;
    services?: string;
    prices?: string;
    contact?: {
      phone?: string;
      email?: string;
      website?: string;
    };
  };
}

const sources: ScrapingSource[] = [
  {
    name: 'panoramafirm',
    url: 'https://panoramafirm.pl/sprzątanie/kraków',
    selector: {
      company: '.company-item',
      name: '.company-name',
      address: '.address',
      contact: {
        phone: '.phone',
        website: '.website'
      }
    }
  },
  {
    name: 'oferteo',
    url: 'https://oferteo.pl/sprzatanie/krakow',
    selector: {
      company: '.company-box',
      name: '.company-name h2',
      address: '.company-address',
      services: '.services-list',
      prices: '.price-info',
      contact: {
        phone: '.company-phone',
        email: '.company-email',
        website: '.company-website'
      }
    }
  }
];

// Inicjalizacja rotatorów
const userAgentRotator = new UserAgentRotator();
const proxyRotator = new ProxyRotator();

interface FetchOptions {
  useProxy?: boolean;
  retries?: number;
  timeout?: number;
  delay?: number;
}

async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<string> {
  const {
    useProxy = true,
    retries = Number(process.env.SCRAPER_MAX_RETRIES) || 3,
    timeout = Number(process.env.SCRAPER_TIMEOUT) || 10000,
    delay = Number(process.env.SCRAPER_REQUEST_DELAY) || 2000
  } = options;

  let lastProxy: Proxy | null = null;
  let lastError: Error | null = null;

  for (let i = 0; i < retries; i++) {
    try {
      // Przygotuj opcje dla fetch
      const fetchOptions: RequestInit = {
        headers: {
          'User-Agent': userAgentRotator.next(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'pl,en-US;q=0.7,en;q=0.3',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout
      };

      // Dodaj proxy jeśli wymagane
      if (useProxy) {
        lastProxy = proxyRotator.next();
        if (lastProxy) {
          const proxyUrl = `http://${lastProxy.auth ? `${lastProxy.auth.username}:${lastProxy.auth.password}@` : ''}${lastProxy.host}:${lastProxy.port}`;
          fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
        }
      }

      const response = await fetch(url, fetchOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Sukces - zaraportuj dla proxy i zwróć wynik
      if (lastProxy) {
        proxyRotator.reportSuccess(lastProxy);
      }

      const text = await response.text();

      // Losowe opóźnienie między żądaniami
      await new Promise(resolve => setTimeout(resolve, Math.random() * delay + delay));

      return text;
    } catch (error) {
      console.error(`Próba ${i + 1}/${retries} nie powiodła się:`, error);
      
      // Raportuj błąd proxy
      if (lastProxy) {
        proxyRotator.reportFailure(lastProxy);
      }

      lastError = error as Error;
      
      if (i === retries - 1) throw error;
      
      // Wykładniczy backoff z dodatkowym losowym opóźnieniem
      const backoffDelay = delay * Math.pow(2, i) + Math.floor(Math.random() * delay);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }

  throw lastError || new Error('Failed to fetch after retries');
}

function extractText($: CheerioAPI, element: Element, selector: string): string {
  return $(element).find(selector).text().trim();
}

function extractHref($: CheerioAPI, element: Element, selector: string): string | undefined {
  return $(element).find(selector).attr('href');
}

function detectServices(text: string): string[] {
  const commonServices = {
    'sprzątanie biur': ['biur', 'biuro', 'biura', 'office', 'powierzchnie biurowe'],
    'sprzątanie domów': ['dom', 'domy', 'mieszkani', 'apartament'],
    'sprzątanie po remoncie': ['remont', 'budow', 'poremontow'],
    'mycie okien': ['okn', 'okien', 'okna', 'witryn'],
    'pranie tapicerki': ['prani', 'tapicerk', 'mebl', 'dywany', 'wykładzin'],
    'sprzątanie przemysłowe': ['przemysłow', 'hal', 'magazyn', 'fabryk'],
    'dezynfekcja': ['dezynfekc', 'odkażani', 'sterylizacj']
  };

  const detectedServices = new Set<string>();
  const lowerText = text.toLowerCase();

  for (const [service, keywords] of Object.entries(commonServices)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      detectedServices.add(service);
    }
  }

  return Array.from(detectedServices);
}

function extractPrices(text: string): { basePrice: number; pricePerHour: number } | null {
  try {
    const pricePerHourRegex = /(\d+)[ ]?(zł|PLN)\/h/i;
    const basePriceRegex = /od[ ]?(\d+)[ ]?(zł|PLN)/i;
    
    const prices = {
      basePrice: 0,
      pricePerHour: 0
    };

    const hourlyMatch = text.match(pricePerHourRegex);
    if (hourlyMatch) {
      prices.pricePerHour = parseInt(hourlyMatch[1], 10);
    }

    const baseMatch = text.match(basePriceRegex);
    if (baseMatch) {
      prices.basePrice = parseInt(baseMatch[1], 10);
    }

    return prices.basePrice > 0 || prices.pricePerHour > 0 ? prices : null;
  } catch (error) {
    console.error('Error extracting prices:', error);
    return null;
  }
}

async function scrapeSource(source: ScrapingSource): Promise<Partial<Company>[]> {
  try {
    const html = await fetchWithRetry(source.url);
    const $ = cheerio.load(html);
    const companies: Partial<Company>[] = [];

    $(source.selector.company).each((_, element) => {
      const companyElement = $(element);
      const companyText = companyElement.text();
      const name = extractText($, element as Element, source.selector.name);

      if (name && name.length > 0) {
        const company: Partial<Company> = {
          name,
          contact: {},
          services: detectServices(companyText)
        };

        if (source.selector.address) {
          company.address = extractText($, element as Element, source.selector.address);
        }

        if (source.selector.contact) {
          if (source.selector.contact.phone) {
            company.contact!.phone = extractText($, element as Element, source.selector.contact.phone);
          }
          if (source.selector.contact.website) {
            company.contact!.website = extractHref($, element as Element, source.selector.contact.website);
          }
          if (source.selector.contact.email) {
            company.contact!.email = extractText($, element as Element, source.selector.contact.email);
          }
        }

        const detectedPrices = extractPrices(companyText);
        if (detectedPrices) {
          company.prices = detectedPrices;
        }

        companies.push(company);
      }
    });

    return companies;
  } catch (error) {
    console.error(`Error scraping ${source.name}:`, error);
    return [];
  }
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const useProxy = process.env.GEOCODING_USE_PROXY === 'true';
  const maxRetries = Number(process.env.GEOCODING_MAX_RETRIES) || 3;
  const retryDelay = Number(process.env.GEOCODING_RETRY_DELAY) || 2000;

  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`;
    
    const response = await fetchWithRetry(url, {
      useProxy,
      retries: maxRetries,
      delay: retryDelay,
      timeout: 5000
    });

    const data = JSON.parse(response);
    
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
}

async function processScrappedCompany(
  fastify: FastifyInstance,
  company: Partial<Company>
): Promise<void> {
  if (!company.name) return;

  try {
    // Sprawdź czy firma już istnieje
    const { data: existing } = await fastify.supabase
      .from('companies')
      .select('id')
      .eq('name', company.name)
      .single();

    const now = new Date().toISOString();

    // Geokoduj adres jeśli istnieje
    let coordinates = null;
    if (company.address) {
      coordinates = await geocodeAddress(company.address);
      // Dodaj opóźnienie aby nie przekroczyć limitów API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (existing) {
      // Aktualizuj istniejącą firmę
      await fastify.supabase
        .from('companies')
        .update({
          ...company,
          coordinates: coordinates || undefined,
          updatedAt: now
        })
        .eq('id', existing.id);
    } else {
      // Dodaj nową firmę
      await fastify.supabase
        .from('companies')
        .insert([{
          ...company,
          coordinates,
          createdAt: now,
          updatedAt: now,
          services: company.services || [],
          prices: company.prices || {
            basePrice: 0,
            pricePerHour: 0
          }
        }]);
    }
  } catch (error) {
    fastify.log.error('Error processing company:', error);
    throw error;
  }
}

export async function setupScraper(fastify: FastifyInstance): Promise<void> {
  // Endpoint do ręcznego uruchomienia scrapera
  fastify.post('/admin/scrape', {
    schema: {
      description: 'Uruchom scraping danych',
      tags: ['Admin'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            companiesScraped: { type: 'number' },
            proxyStats: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  host: { type: 'string' },
                  requests: {
                    type: 'object',
                    properties: {
                      minute: { type: 'number' },
                      day: { type: 'number' }
                    }
                  },
                  status: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      let totalCompanies = 0;
      
      for (const source of sources) {
        const companies = await scrapeSource(source);
        
        for (const company of companies) {
          await processScrappedCompany(fastify, company);
          totalCompanies++;
        }
      }

      return {
        status: 'success',
        companiesScraped: totalCompanies,
        proxyStats: proxyRotator.getStats()
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        status: 'error',
        message: 'Błąd podczas scrapowania danych'
      });
    }
  });

  // Endpoint do sprawdzenia statystyk proxy
  fastify.get('/admin/proxy-stats', {
    schema: {
      description: 'Pobierz statystyki proxy',
      tags: ['Admin'],
      response: {
        200: {
          type: 'object',
          properties: {
            stats: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  host: { type: 'string' },
                  requests: {
                    type: 'object',
                    properties: {
                      minute: { type: 'number' },
                      day: { type: 'number' }
                    }
                  },
                  status: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async () => {
    return {
      stats: proxyRotator.getStats()
    };
  });

  // Endpoint do testowania proxy
  fastify.post('/admin/test-proxies', {
    schema: {
      description: 'Przetestuj wszystkie skonfigurowane proxy',
      tags: ['Admin'],
      response: {
        200: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  host: { type: 'string' },
                  working: { type: 'boolean' },
                  responseTime: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, async () => {
    const testResults: Array<{
      host: string;
      working: boolean;
      responseTime: number;
    }> = [];

    for (const proxyStats of proxyRotator.getStats()) {
      const startTime = Date.now();
      const username = process.env.SCRAPER_PROXY_USERNAME || 'default';
      const password = process.env.SCRAPER_PROXY_PASSWORD || 'default';
      
      const proxy: Proxy = {
        host: proxyStats.host,
        port: 8080, // default port
        auth: {
          username,
          password
        },
        maxRequestsPerMinute: 60, // domyślne limity
        maxRequestsPerDay: 5000
      };

      const working = await proxyRotator.checkProxy(proxy);
      const responseTime = Date.now() - startTime;

      testResults.push({
        host: proxy.host,
        working,
        responseTime
      });

      // Dodaj opóźnienie między testami
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return { results: testResults };
  });

  // Zaplanuj automatyczny scraping
  const scheduleScrapingJob = async (): Promise<void> => {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const INITIAL_DELAY = 5 * 60 * 1000; // 5 minut po starcie

    // Poczekaj 5 minut po starcie serwera
    await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY));
    
    setInterval(async () => {
      try {
        fastify.log.info('Rozpoczynanie zaplanowanego scrapingu...');
        
        // Pobierz statystyki proxy przed rozpoczęciem
        const initialProxyStats = proxyRotator.getStats();
        fastify.log.info('Stan proxy przed scrapingiem:', initialProxyStats);

        for (const source of sources) {
          fastify.log.info(`Scrapowanie źródła: ${source.name}`);
          const companies = await scrapeSource(source);
          
          for (const company of companies) {
            await processScrappedCompany(fastify, company);
          }
          
          fastify.log.info(`Zescrapowano ${companies.length} firm z ${source.name}`);
          
          // Dodaj losowe opóźnienie między źródłami (5-15 sekund)
          const delay = 5000 + Math.random() * 10000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Pobierz finalne statystyki proxy
        const finalProxyStats = proxyRotator.getStats();
        fastify.log.info('Stan proxy po scrapingu:', finalProxyStats);

      } catch (error) {
        fastify.log.error('Błąd podczas zaplanowanego scrapingu:', error);
      }
    }, TWENTY_FOUR_HOURS);
  };

  // Uruchom planowanie przy starcie serwera
  await scheduleScrapingJob();
}
