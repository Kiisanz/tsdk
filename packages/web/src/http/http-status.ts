// SPDX-License-Identifier: MIT
/**
 * HTTP status code enumeration based on the latest RFCs (RFC 9110, RFC 9111, RFC 2324, etc.).
 *
 * The enum values are the numeric status codes. The name follows the conventional
 * "Status<ReasonPhrase>" pattern (e.g., `OK = 200`, `NotFound = 404`).
 *
 * This file lives in the `@tsnx/web` package because status codes are a core part
 * of the web‑application layer. It can be imported as:
 *
 * ```ts
 * import { HttpStatus } from '@tsnx/web';
 * ```
 */
export enum HttpStatus {
  // 1xx – Informational
  Continue = 100,
  SwitchingProtocols = 101,
  Processing = 102, // RFC 2518
  EarlyHints = 103,

  // 2xx – Success
  OK = 200,
  Created = 201,
  Accepted = 202,
  NonAuthoritativeInformation = 203,
  NoContent = 204,
  ResetContent = 205,
  PartialContent = 206,
  MultiStatus = 207, // RFC 4918
  AlreadyReported = 208, // RFC 5842
  IMUsed = 226, // RFC 3229

  // 3xx – Redirection
  MultipleChoices = 300,
  MovedPermanently = 301,
  Found = 302,
  SeeOther = 303,
  NotModified = 304,
  UseProxy = 305,
  TemporaryRedirect = 307,
  PermanentRedirect = 308,

  // 4xx – Client Errors
  BadRequest = 400,
  Unauthorized = 401,
  PaymentRequired = 402,
  Forbidden = 403,
  NotFound = 404,
  MethodNotAllowed = 405,
  NotAcceptable = 406,
  ProxyAuthenticationRequired = 407,
  RequestTimeout = 408,
  Conflict = 409,
  Gone = 410,
  LengthRequired = 411,
  PreconditionFailed = 412,
  PayloadTooLarge = 413,
  URITooLong = 414,
  UnsupportedMediaType = 415,
  RangeNotSatisfiable = 416,
  ExpectationFailed = 417,
  ImATeapot = 418, // RFC 2324
  MisdirectedRequest = 421, // RFC 7540
  UnprocessableEntity = 422, // RFC 4918
  Locked = 423, // RFC 4918
  FailedDependency = 424, // RFC 4918
  TooEarly = 425, // RFC 8470
  UpgradeRequired = 426,
  PreconditionRequired = 428, // RFC 6585
  TooManyRequests = 429,
  RequestHeaderFieldsTooLarge = 431, // RFC 6585
  UnavailableForLegalReasons = 451, // RFC 7725

  // 5xx – Server Errors
  InternalServerError = 500,
  NotImplemented = 501,
  BadGateway = 502,
  ServiceUnavailable = 503,
  GatewayTimeout = 504,
  HTTPVersionNotSupported = 505,
  VariantAlsoNegotiates = 506,
  InsufficientStorage = 507, // RFC 4918
  LoopDetected = 508, // RFC 5842
  NotExtended = 510,
  NetworkAuthenticationRequired = 511,
}
