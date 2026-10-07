export class OptionsValidationError extends Error {
  constructor(
    public readonly optionsName: string,
    public readonly failures: string[],
  ) {
    super(`Options validation failed for "${optionsName}":\n- ${failures.join('\n- ')}`);
    this.name = 'OptionsValidationError';
  }
}
