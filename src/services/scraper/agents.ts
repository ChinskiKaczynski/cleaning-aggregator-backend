import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { RequestInit } from 'node-fetch';

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/120.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/120.0'
];

export class UserAgentRotator {
  private currentIndex: number = 0;

  constructor(private agents: string[] = userAgents) {
    this.shuffle();
  }

  public next(): string {
    const agent = this.agents[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.agents.length;
    return agent;
  }

  private shuffle(): void {
    for (let i = this.agents.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.agents[i], this.agents[j]] = [this.agents[j], this.agents[i]];
    }
  }
}

export interface Proxy {
  host: string;
  port: number;
  auth?: {
    username: string;
    password: string;
  };
  maxRequestsPerMinute: number;
  maxRequestsPerDay: number;
}

interface ProxyUsage {
  proxy: Proxy;
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
  private currentIndex: number = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private readonly BLOCK_DURATION = 30 * 60 * 1000; // 30 minut

  constructor() {
    this.loadProxiesFromConfig();
    this.startUsageResetTimer();
  }

  private loadProxiesFromConfig(): void {
    try {
      const proxyListEnv = process.env.PROXY_LIST;
      if (!proxyListEnv) {
        console.warn('PROXY_LIST nie skonfigurowana');
        return;
      }

      const proxies: Proxy[] = JSON.parse(proxyListEnv);
      this.proxyUsage = proxies.map(proxy => ({
        proxy,
        requestsThisMinute: 0,
        requestsToday: 0,
        lastMinuteTimestamp: Date.now(),
        lastDayTimestamp: Date.now(),
        consecutiveFailures: 0,
        isBlocked: false,
        lastUsed: 0
      }));

      console.log(`Załadowano ${proxies.length} proxy`);
    } catch (error) {
      console.error('Błąd podczas ładowania proxy:', error);
    }
  }

  private startUsageResetTimer(): void {
    // Reset liczników co minutę
    setInterval(() => {
      const now = Date.now();
      this.proxyUsage.forEach(usage => {
        // Reset licznika minutowego
        if (now - usage.lastMinuteTimestamp >= 60000) {
          usage.requestsThisMinute = 0;
          usage.lastMinuteTimestamp = now;
        }
        // Reset licznika dziennego
        if (now - usage.lastDayTimestamp >= 86400000) {
          usage.requestsToday = 0;
          usage.lastDayTimestamp = now;
        }
        // Odblokuj proxy po czasie
        if (usage.isBlocked && now - usage.lastUsed >= this.BLOCK_DURATION) {
          usage.isBlocked = false;
          usage.consecutiveFailures = 0;
        }
      });
    }, 60000);
  }

  public next(): Proxy | null {
    if (this.proxyUsage.length === 0) return null;

    // Znajdź następne dostępne proxy
    for (let i = 0; i < this.proxyUsage.length; i++) {
      const index = (this.currentIndex + i) % this.proxyUsage.length;
      const usage = this.proxyUsage[index];

      if (this.canUseProxy(usage)) {
        this.currentIndex = (index + 1) % this.proxyUsage.length;
        this.updateProxyUsage(usage);
        return usage.proxy;
      }
    }

    console.warn('Brak dostępnych proxy!');
    return null;
  }

  private canUseProxy(usage: ProxyUsage): boolean {
    const { proxy, requestsThisMinute, requestsToday, isBlocked } = usage;

    return !isBlocked &&
           requestsThisMinute < proxy.maxRequestsPerMinute &&
           requestsToday < proxy.maxRequestsPerDay;
  }

  private updateProxyUsage(usage: ProxyUsage): void {
    usage.requestsThisMinute++;
    usage.requestsToday++;
    usage.lastUsed = Date.now();
  }

  public reportSuccess(proxy: Proxy): void {
    const usage = this.getProxyUsage(proxy);
    if (usage) {
      usage.consecutiveFailures = 0;
    }
  }

  public reportFailure(proxy: Proxy): void {
    const usage = this.getProxyUsage(proxy);
    if (usage) {
      usage.consecutiveFailures++;
      if (usage.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        usage.isBlocked = true;
        console.warn(`Proxy ${proxy.host}:${proxy.port} zablokowane po ${usage.consecutiveFailures} nieudanych próbach`);
      }
    }
  }

  private getProxyUsage(proxy: Proxy): ProxyUsage | undefined {
    return this.proxyUsage.find(u => 
      u.proxy.host === proxy.host && 
      u.proxy.port === proxy.port
    );
  }

  public async checkProxy(proxy: Proxy): Promise<boolean> {
    try {
      const proxyUrl = `http://${proxy.auth ? `${proxy.auth.username}:${proxy.auth.password}@` : ''}${proxy.host}:${proxy.port}`;
      const proxyAgent = new HttpsProxyAgent(proxyUrl);

      const response = await fetch('http://example.com', {
        agent: proxyAgent,
        timeout: 5000
      });

      return response.ok;
    } catch (error) {
      console.error(`Proxy ${proxy.host}:${proxy.port} niedostępne:`, error);
      return false;
    }
  }

  public getStats(): Array<{
    host: string;
    requests: { minute: number; day: number };
    status: string;
  }> {
    return this.proxyUsage.map(usage => ({
      host: usage.proxy.host,
      requests: {
        minute: usage.requestsThisMinute,
        day: usage.requestsToday
      },
      status: usage.isBlocked ? 'blocked' : 
              this.canUseProxy(usage) ? 'available' : 'limited'
    }));
  }
}