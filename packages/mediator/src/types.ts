/**
 * Marker interface for a Mediator request producing a response of type TResponse.
 * Used for CQRS Commands and Queries.
 */
export interface IRequest<TResponse = void> {
  readonly _responseType?: TResponse;
}

/**
 * Base class for Mediator requests (Commands and Queries).
 * Extending this class ensures automatic TypeScript type inference of the response in mediator.send().
 */
export abstract class Request<TResponse = void> implements IRequest<TResponse> {
  declare readonly _responseType?: TResponse;
}

/**
 * Next handler delegate in the pipeline behavior chain.
 */
export type RequestHandlerDelegate<TResponse> = () => Promise<TResponse>;

/**
 * Handles a specific IRequest producing a TResponse.
 */
export interface IRequestHandler<TRequest extends IRequest<TResponse> | object, TResponse = void> {
  handle(request: TRequest, cancellationToken?: AbortSignal): Promise<TResponse> | TResponse;
}

/**
 * Marker interface for a broadcast event or notification.
 * Dispatched to zero or more INotificationHandler instances.
 */
export interface INotification {}

/**
 * Base class for broadcast events or notifications.
 */
export abstract class Notification implements INotification {}

/**
 * Handles a specific broadcast INotification event.
 */
export interface INotificationHandler<TNotification extends INotification | object> {
  handle(notification: TNotification, cancellationToken?: AbortSignal): Promise<void> | void;
}

/**
 * Middleware that wraps around request handler execution (Onion Architecture).
 * Enables cross-cutting concerns like validation, logging, performance profiling, and transactions.
 */
export interface IPipelineBehavior<TRequest = any, TResponse = any> {
  handle(
    request: TRequest,
    next: RequestHandlerDelegate<TResponse>,
    cancellationToken?: AbortSignal,
  ): Promise<TResponse>;
}

/**
 * Defines a sender for dispatching requests to their single handler.
 */
export interface ISender {
  send<TResponse>(request: IRequest<TResponse>, cancellationToken?: AbortSignal): Promise<TResponse>;
  send<TResponse = any>(request: object, cancellationToken?: AbortSignal): Promise<TResponse>;
}

/**
 * Strategy for dispatching notifications to multiple handlers.
 * - 'parallel': Executes all handlers concurrently using Promise.all (default).
 * - 'sequential': Executes handlers sequentially in order of registration.
 */
export type PublishStrategy = 'parallel' | 'sequential';

/**
 * Defines a publisher for broadcasting notifications to multiple handlers.
 */
export interface IPublisher {
  publish<TNotification extends INotification | object>(
    notification: TNotification,
    cancellationToken?: AbortSignal,
  ): Promise<void>;
}

/**
 * Unified Mediator interface combining request sending and notification publishing.
 */
export interface IMediator extends ISender, IPublisher {}

/**
 * Configuration options for the Mediator container.
 */
export interface MediatorConfiguration {
  publishStrategy?: PublishStrategy;
}
