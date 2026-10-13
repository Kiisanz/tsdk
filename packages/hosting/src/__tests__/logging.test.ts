import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LoggerFactory, LogLevel } from '../logging/index.js';

describe('@tsnx/hosting: Logging Abstraction', () => {
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

  it('F-005: formats category cleanly without [0] when eventId is zero and formats [eventId] when non-zero', () => {
    const factory = new LoggerFactory(LogLevel.Information);
    const logger = factory.createLogger('HttpServer');

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => {
      logs.push(msg);
    };

    try {
      // 1. Without event ID
      logger.info('Listening on port 3000');
      assert.ok(logs[0].includes('info: HttpServer\n'));
      assert.ok(!logs[0].includes('HttpServer[0]'));

      // 2. With non-zero event ID as number
      logger.info('Request started', 1001);
      assert.ok(logs[1].includes('info: HttpServer[1001]\n'));

      // 3. With non-zero event ID as object
      logger.info('Connection accepted', { eventId: 2002, ip: '127.0.0.1' });
      assert.ok(logs[2].includes('info: HttpServer[2002]\n'));
    } finally {
      console.log = originalLog;
    }
  });
});
