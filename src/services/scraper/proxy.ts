import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch, { RequestInit } from 'node-fetch';
import config from '../../config/config';

interface ProxyAuth {
  username: string;
  password: string;
}

interface Proxy {
  host: string;
  port: number;
  auth?: ProxyAuth;
  maxRequestsPerMinute?: number;
  maxRequestsPerDay?: number;
}

interface ProxyUsage {
  proxy: Required<Proxy>;
  requestsThisMinute: number;
  requestsToday: number;
  lastMinuteTimestamp: number;
  lastDayTimestamp: number;
  consecutiveFailures: number;
  isBlocked: boolean;
  lastUsed: number;
}

export class ProxyRotator {
  private proxyUsage: ProxyUsage[] = [];
  private currentIndex = 0;
  private enabled: boolean;

  constructor() {
    this.enabled = config.proxy.enabled;
    if (this.enabled) {
      this.loadProxiesFromConfig();
      
      if (this.proxyUsage.length > 0) {
        this.proxyUsage.forEach(async (usage) => {
          const isAlive = await this.checkProxy(usage.proxy);
          if (!isAlive) {
            console.warn(`Proxy ${usage.proxy.host}:${usage.proxy.port} niedostępne przy starcie`);
            usage.isBlocked = true;
          }
        });
        
        this.startUsageResetTimer();
      }
    } else {
      console.log('System proxy jest wyłączony');
    }
  }

  private loadProxiesFromConfig(): void {
    try {
      if (!config.proxy.list) {
        console.warn('PROXY_LIST nie skonfigurowana w zmiennych środowiskowych');
        return;
      }

      let parsedProxies: Proxy[];
      try {
        // Jeśli config.proxy.list jest już obiektem (został sparsowany przez dotenv)
        parsedProxies = typeof config.proxy.list === 'string' 
          ? JSON.parse(config.proxy.list) 
          : config.proxy.list;
      } catch (e) {
        console.error('Błąd parsowania PROXY_LIST:', e);
        return;
      }
      
      if (!Array.isArray(parsedProxies)) {
        throw new Error('Nieprawidłowy format PROXY_LIST - oczekiwano tablicy');
      }

      this.proxyUsage = parsedProxies.map(proxy => ({
        proxy: {
          host: proxy.host,
          port: proxy.port,
          auth: proxy.auth || { username: '', password: '' },
          maxRequestsPerMinute: proxy.maxRequestsPerMinute || 100,
          maxRequestsPerDay: proxy.maxRequestsPerDay || 5000
        },
        requestsThisMinute: 0,
        requestsToday: 0,
        lastMinuteTimestamp: Date.now(),
        lastDayTimestamp: Date.now(),
        consecutiveFailures: 0,
        isBlocked: false,
        lastUsed: 0
      }));

      console.log(`Załadowano ${parsedProxies.length} proxy`);
    } catch (error) {
      console.error('Błąd inicjalizacji proxy:', error);
    }
  }

  private startUsageResetTimer(): void {
    // Reset liczników co minutę
    setInterval(() => {
      const now = Date.now();
      this.proxyUsage.forEach(usage => {
        if (now - usage.lastMinuteTimestamp >= 60000) {
          usage.requestsThisMinute = 0;
          usage.lastMinuteTimestamp = now;
        }
      });
    }, 60000);

    // Reset liczników dziennych o północy
    setInterval(() => {
      const now = Date.now();
      this.proxyUsage.forEach(usage => {
        if (now - usage.lastDayTimestamp >= 86400000) {
          usage.requestsToday = 0;
          usage.lastDayTimestamp = now;
        }
      });
    }, 3600000); // Sprawdzaj co godzinę
  }

  private async checkProxy(proxy: Required<Proxy>): Promise<boolean> {
    try {
      const proxyUrl = `http://${proxy.auth.username ? `${proxy.auth.username}:${proxy.auth.password}@` : ''}${proxy.host}:${proxy.port}`;
      const agent = new HttpsProxyAgent(proxyUrl);

      const fetchOptions: RequestInit = {
        // @ts-ignore
        agent,
        timeout: config.proxy.timeoutMs
      };

      const response = await fetch('https://api.ipify.org?format=json', fetchOptions);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  public next(): Required<Proxy> | null {
    if (!this.enabled || this.proxyUsage.length === 0) {
      return null;
    }

    const now = Date.now();
    let attempts = 0;
    const maxAttempts = this.proxyUsage.length;

    while (attempts < maxAttempts) {
      const usage = this.proxyUsage[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.proxyUsage.length;

      if (usage.isBlocked) continue;
      if (usage.consecutiveFailures >= config.proxy.retryAttempts) continue;
      if (usage.requestsThisMinute >= usage.proxy.maxRequestsPerMinute) continue;
      if (usage.requestsToday >= usage.proxy.maxRequestsPerDay) continue;

      // Aktualizuj liczniki
      usage.requestsThisMinute++;
      usage.requestsToday++;
      usage.lastUsed = now;

      return usage.proxy;
    }

    return null;
  }

  public reportFailure(proxy: Required<Proxy>): void {
    if (!this.enabled) return;

    const usage = this.proxyUsage.find(u => 
      u.proxy.host === proxy.host && 
      u.proxy.port === proxy.port
    );

    if (usage) {
      usage.consecutiveFailures++;
      if (usage.consecutiveFailures >= config.proxy.retryAttempts) {
        usage.isBlocked = true;
        console.warn(`Proxy ${proxy.host}:${proxy.port} zablokowane po ${usage.consecutiveFailures} nieudanych próbach`);
      }
    }
  }

  public reportSuccess(proxy: Required<Proxy>): void {
    if (!this.enabled) return;

    const usage = this.proxyUsage.find(u => 
      u.proxy.host === proxy.host && 
      u.proxy.port === proxy.port
    );

    if (usage) {
      usage.consecutiveFailures = 0;
    }
  }
}