import { HttpContext } from '../http/http-context.js';
import { IServiceProvider, Constructor } from '@tsnx/hosting';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [key: string]: unknown;
}

export interface ProblemDetailsInput {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface IExceptionHandler {
  tryHandleAsync(
    ctx: HttpContext,
    error: unknown,
  ): boolean | Promise<boolean>;
}

export interface ExceptionHandlerOptions {
  includeDetails?: boolean;
}

export const EXCEPTION_HANDLER_TOKEN: unique symbol = Symbol('TSNX_EXCEPTION_HANDLER');

export interface ExceptionHandlerRegistration {
  handler: Constructor<IExceptionHandler> | ((sp: IServiceProvider) => IExceptionHandler);
  dependencies?: any[];
}

export class BadHttpRequestException extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'BadHttpRequestException';
    this.statusCode = statusCode;
  }
}
