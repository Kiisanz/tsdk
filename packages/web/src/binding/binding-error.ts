export type BindingSource = 'body' | 'query' | 'route' | 'header';

export interface BindingErrorEntry {
  source: BindingSource;
  path: string;
  message: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
  [key: string]: any;
}

export class RequestBindingException extends Error {
  public readonly status = 400;
  public readonly entries: readonly BindingErrorEntry[];

  constructor(entries: BindingErrorEntry[]) {
    const summary = entries.map((e) => `[${e.source}:${e.path}] ${e.message}`).join('; ');
    super(`Request binding failed: ${summary}`);
    this.name = 'RequestBindingException';
    this.entries = entries;
  }

  public toProblemDetails(): ProblemDetails {
    const errors: Record<string, string[]> = {};
    for (const entry of this.entries) {
      if (!errors[entry.path]) {
        errors[entry.path] = [];
      }
      errors[entry.path].push(entry.message);
    }

    return {
      type: 'https://tools.ietf.org/html/rfc9457',
      title: 'One or more request binding errors occurred.',
      status: 400,
      errors,
    };
  }
}
