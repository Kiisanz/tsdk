import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LoggerFactory, LogLevel } from '../logging/index.js';

describe('@tsdk/hosting: Logging Abstraction', () => {
  it('filters log messages based on minimum log level', () => {
    const factory = new LoggerFactory(LogLevel.Warning);
    const logger = factory.createLogger('TestCategory');

    assert.equal(logger.isEnabled(LogLevel.Debug), false);
    assert.equal(logger.isEnabled(LogLevel.Information), false);
    assert.equal(logger.isEnabled(LogLevel.Warning), true);
    assert.equal(logger.isEnabled(LogLevel.Error), true);

    factory.setMinimumLevel(LogLevel.Debug);
    assert.equal(logger.isEnabled(LogLevel.Debug), true);
  });
});
