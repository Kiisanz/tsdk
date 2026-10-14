import { createToken, ServiceToken } from '../di/types.js';

export class StartupValidator {
  constructor(
    public readonly name: string,
    public readonly validate: () => void,
  ) {}
}

export const STARTUP_VALIDATOR_TOKEN: ServiceToken<StartupValidator> = createToken<StartupValidator>('TSNX:StartupValidator');
