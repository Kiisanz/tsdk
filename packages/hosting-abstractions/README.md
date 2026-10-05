# @tsnx/hosting-abstractions

Zero-runtime-dependency abstractions for Dependency Injection, Configuration, Logging, and Application Lifecycle in TSNX.

Equivalent to `Microsoft.Extensions.DependencyInjection.Abstractions` and `Microsoft.Extensions.Hosting.Abstractions` in .NET.

## Overview

Use `@tsnx/hosting-abstractions` in libraries and domain/application modules when you want to define service contracts, register services via `IServiceCollection`, or define typed service tokens without pulling in the concrete hosting container runtime.

## Installation

```bash
pnpm add @tsnx/hosting-abstractions
```

## Usage

### Modular Dependency Injection in Application Layer

```typescript
import type { IServiceCollection } from '@tsnx/hosting-abstractions';
import { createToken, type ServiceToken } from '@tsnx/hosting-abstractions';

export interface IUserService {
  getUser(id: string): Promise<User>;
}

export const USER_SERVICE: ServiceToken<IUserService> = createToken<IUserService>('IUserService');

export function addApplicationServices(services: IServiceCollection): IServiceCollection {
  services.addTransient(CreateUserUseCase);
  return services;
}
```
