import { FastifyInstance } from 'fastify';
import { createClient } from 'redis';
import fetch from 'node-fetch';
import type { LatLngLiteral } from '../../types/company';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ProxyRotator } from '../scraper/agents';

interface GeocodingLimits {
  requestsPerSecond: number;
  requestsPerDay: number;
  currentDay: string;
  dailyRequests: number;
  lastRequestTime: number;
}

export class GeocodingService {
  private limits: GeocodingLimits;
  private redis;
  private proxyRotator: ProxyRotator;

  constructor(private fastify: FastifyInstance) {
    this.limits = {
      requestsPerSecond: Number(process.env.GEOCODING_MAX_REQUESTS_PER_SECOND) || 1,
      requestsPerDay: Number(process.env.GEOCODING_MAX_REQUESTS_PER_DAY) || 2500,
      currentDay: new Date().toISOString().split('T')[0],
      dailyRequests: 0,
      lastRequestTime: 0
    };

    this.redis = createClient({
      url: process.env.REDIS_URL
    });
    this.redis.connect();

    this.proxyRotator = new ProxyRotator();
  }

  private async checkRateLimits(): Promise<boolean> {
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    // Reset dzienny licznik jeśli to nowy dzień
    if (today !== this.limits.currentDay) {
      this.limits.currentDay = today;
      this.limits.dailyRequests = 0;
      await this.redis.set('geocoding:dailyRequests', '0');
    }

    // Pobierz aktualną liczbę requestów z Redis
    const dailyRequests = parseInt(await this.redis.get('geocoding:dailyRequests') || '0');

    // Sprawdź limity
    if (dailyRequests >= this.limits.requestsPerDay) {
      this.fastify.log.warn('Przekroczono dzienny limit geokodowania');
      return false;
    }

    const timeSinceLastRequest = now - this.limits.lastRequestTime;
    const minTimeBetweenRequests = 1000 / this.limits.requestsPerSecond;

    if (timeSinceLastRequest < minTimeBetweenRequests) {
      const delay = minTimeBetweenRequests - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Aktualizuj liczniki
    this.limits.lastRequestTime = now;
    this.limits.dailyRequests = dailyRequests + 1;
    await this.redis.set('geocoding:dailyRequests', String(this.limits.dailyRequests));

    return true;
  }

  async geocodeAddress(address: string): Promise<LatLngLiteral | null> {
    const maxRetries = Number(process.env.GEOCODING_MAX_RETRIES) || 3;
    const retryDelay = Number(process.env.GEOCODING_RETRY_DELAY) || 2000;

    try {
      // Sprawdź cache
      const cacheKey = `geocoding:${address}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Sprawdź limity przed wykonaniem zapytania
      if (!(await this.checkRateLimits())) {
        throw new Error('Rate limit exceeded for geocoding');
      }

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const proxy = this.proxyRotator.next();
          const fetchOptions: any = {
            headers: {
              'User-Agent': 'CleaningServicesAggregator/1.0',
              'Accept-Language': 'pl'
            }
          };

          // Dodaj proxy jeśli dostępne i włączone
          if (proxy && process.env.GEOCODING_USE_PROXY === 'true') {
            const proxyUrl = `http://${proxy.auth ? `${proxy.auth.username}:${proxy.auth.password}@` : ''}${proxy.host}:${proxy.port}`;
            fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
          }

          const encodedAddress = encodeURIComponent(address);
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`,
            fetchOptions
          );

          if (!response.ok) {
            throw new Error(`Geocoding failed: ${response.status}`);
          }

          const data = await response.json();

          if (data && data.length > 0) {
            const result = {
              lat: parseFloat(data[0].lat),
              lng: parseFloat(data[0].lon)
            };

            // Zapisz w cache na 30 dni
            await this.redis.setEx(cacheKey, 30 * 24 * 60 * 60, JSON.stringify(result));

            // Raportuj sukces dla proxy
            if (proxy) {
              this.proxyRotator.reportSuccess(proxy);
            }

            return result;
          }

          return null;
        } catch (error) {
          // Raportuj błąd dla proxy
          const proxy = this.proxyRotator.next();
          if (proxy) {
            this.proxyRotator.reportFailure(proxy);
          }

          if (attempt === maxRetries - 1) {
            throw error;
          }

          // Wykładniczy backoff z dodatkowym losowym opóźnieniem
          const backoffDelay = retryDelay * Math.pow(2, attempt) + Math.floor(Math.random() * retryDelay);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
      }

      return null;
    } catch (error) {
      this.fastify.log.error('Error geocoding address:', error);
      throw error;
    }
  }

  async getStats(): Promise<{
    dailyRequests: number;
    remainingRequests: number;
    lastRequestTime: number;
  }> {
    const dailyRequests = parseInt(await this.redis.get('geocoding:dailyRequests') || '0');
    return {
      dailyRequests,
      remainingRequests: this.limits.requestsPerDay - dailyRequests,
      lastRequestTime: this.limits.lastRequestTime
    };
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}