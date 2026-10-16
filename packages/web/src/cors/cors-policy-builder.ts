import { CorsPolicy } from './types.js';

export class CorsPolicyBuilder {
  private origins: string[] = [];
  private isOriginAllowedPredicate?: (origin: string) => boolean;
  private anyOrigin = false;
  private methods: string[] = [];
  private anyMethod = false;
  private headers: string[] = [];
  private anyHeader = false;
  private credentials = false;
  private exposedHeaders: string[] = [];
  private preflightMaxAge?: number;

  public withOrigins(...origins: string[]): this {
    this.anyOrigin = false;
    for (const origin of origins) {
      if (origin === '*') {
        this.anyOrigin = true;
      } else {
        this.origins.push(origin);
      }
    }
    return this;
  }

  public allowAnyOrigin(): this {
    this.anyOrigin = true;
    this.origins = [];
    return this;
  }

  public setIsOriginAllowed(predicate: (origin: string) => boolean): this {
    this.isOriginAllowedPredicate = predicate;
    return this;
  }

  public withMethods(...methods: string[]): this {
    this.anyMethod = false;
    for (const method of methods) {
      if (method === '*') {
        this.anyMethod = true;
      } else {
        this.methods.push(method.toUpperCase());
      }
    }
    return this;
  }

  public allowAnyMethod(): this {
    this.anyMethod = true;
    this.methods = [];
    return this;
  }

  public withHeaders(...headers: string[]): this {
    this.anyHeader = false;
    for (const header of headers) {
      if (header === '*') {
        this.anyHeader = true;
      } else {
        this.headers.push(header.toLowerCase());
      }
    }
    return this;
  }

  public allowAnyHeader(): this {
    this.anyHeader = true;
    this.headers = [];
    return this;
  }

  public allowCredentials(allow = true): this {
    this.credentials = allow;
    return this;
  }

  public withExposedHeaders(...headers: string[]): this {
    for (const h of headers) {
      this.exposedHeaders.push(h);
    }
    return this;
  }

  public setPreflightMaxAge(seconds: number): this {
    this.preflightMaxAge = seconds;
    return this;
  }

  public build(): CorsPolicy {
    return {
      origins: [...this.origins],
      isOriginAllowed: this.isOriginAllowedPredicate,
      allowAnyOrigin: this.anyOrigin,
      methods: [...this.methods],
      allowAnyMethod: this.anyMethod,
      headers: [...this.headers],
      allowAnyHeader: this.anyHeader,
      allowCredentials: this.credentials,
      exposedHeaders: [...this.exposedHeaders],
      preflightMaxAgeSeconds: this.preflightMaxAge,
    };
  }
}
