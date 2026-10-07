import { HttpContext } from '../http/http-context.js';
import { RequestDelegate } from './pipeline.js';
import { ILogger } from '@tsnx/hosting';
import {
  ExceptionHandlerPipeline,
  HandlerDescriptorOrType,
} from '../errors/exception-handler-pipeline.js';
import { ExceptionHandlerOptions } from '../errors/types.js';

export { ExceptionHandlerOptions };
export type ErrorHandlerOptions = ExceptionHandlerOptions;

export function createExceptionHandlerMiddleware(
  pipelineOrLogger?: ExceptionHandlerPipeline | ILogger,
  options: ExceptionHandlerOptions = {},
  handlers: readonly HandlerDescriptorOrType[] = []
) {
  let pipeline: ExceptionHandlerPipeline;
  if (pipelineOrLogger instanceof ExceptionHandlerPipeline) {
    pipeline = pipelineOrLogger;
  } else {
    pipeline = new ExceptionHandlerPipeline(handlers, pipelineOrLogger, options);
  }

  return async (ctx: HttpContext, next: RequestDelegate): Promise<void> => {
    try {
      await next(ctx);
    } catch (err: unknown) {
      await pipeline.handleAsync(ctx, err);
    }
  };
}
