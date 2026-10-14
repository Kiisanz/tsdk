import { IOptions, IOptionsSnapshot } from './types.js';

export class OptionsWrapper<T> implements IOptions<T> {
  constructor(public readonly value: T) {}
}

export class OptionsSnapshot<T> implements IOptionsSnapshot<T> {
  constructor(public readonly value: T) {}
}
