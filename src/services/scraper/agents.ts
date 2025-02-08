import { load } from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch, { RequestInit } from 'node-fetch';
import { ProxyRotator } from './proxy';

export class Agent {
  private proxyRotator: ProxyRotator;

  constructor() {
    this.proxyRotator = new ProxyRotator();
  }

  protected async fetch(url: string, options: RequestInit = {}): Promise<string> {
    const proxy = this.proxyRotator.next();
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        let fetchOptions: RequestInit = {
          ...options,
          headers: {
            'User-Agent': this.getRandomUserAgent(),
            ...options.headers,
          },
          timeout: 10000,
        };

        if (proxy) {
          const proxyUrl = `http://${proxy.auth.username ? `${proxy.auth.username}:${proxy.auth.password}@` : ''}${proxy.host}:${proxy.port}`;
          // @ts-ignore
          fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
        }

        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const content = await response.text();
        if (proxy) {
          this.proxyRotator.reportSuccess(proxy);
        }
        return content;

      } catch (error) {
        attempts++;
        if (proxy) {
          this.proxyRotator.reportFailure(proxy);
        }
        
        if (attempts === maxAttempts) {
          throw new Error(`Failed to fetch ${url} after ${maxAttempts} attempts: ${error}`);
        }
        
        // Czekaj przed kolejną próbą
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }

    throw new Error('Unreachable code - loop should have either returned or thrown');
  }

  protected $(html: string) {
    return load(html);
  }

  private getRandomUserAgent(): string {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }
}

// Przykładowa implementacja dla konkretnej strony
export class ExampleSiteAgent extends Agent {
  async scrapeCompanyDetails(url: string) {
    const html = await this.fetch(url);
    const $ = this.$(html);

    return {
      name: $('.company-name').text().trim(),
      description: $('.company-description').text().trim(),
      // ... więcej pól
    };
  }
}