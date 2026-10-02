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

  it('F-009: preserves numeric arguments in standard logging without sniffing as eventId', () => {
    const factory = new LoggerFactory(LogLevel.Information);
    const logger = factory.createLogger('HttpServer');

    const logs: { msg: string; args: any[] }[] = [];
    const originalLog = console.log;
    console.log = (msg: string, ...args: any[]) => {
      logs.push({ msg, args });
    };

    try {
      // 1. Numeric argument (port number) is preserved in payload, NOT treated as eventId
      logger.info('Server listening on port', 3000);
      assert.equal(logs.length, 1);
      assert.ok(logs[0].msg.includes('info: HttpServer\n'));
      assert.ok(!logs[0].msg.includes('HttpServer[3000]'));
      assert.ok(!logs[0].msg.includes('HttpServer[0]'));
      assert.deepEqual(logs[0].args, [3000]);

      // 2. Explicit logEvent with non-zero eventId outputs Category[eventId]
      logger.logEvent(LogLevel.Information, { eventId: 1001 }, 'Server started', { port: 3000 });
      assert.equal(logs.length, 2);
      assert.ok(logs[1].msg.includes('info: HttpServer[1001]\n'));
      assert.deepEqual(logs[1].args, [{ port: 3000 }]);

      // 3. Explicit logEvent with eventId = 0 outputs clean Category without [0]
      logger.logEvent(LogLevel.Information, { eventId: 0 }, 'Heartbeat check');
      assert.equal(logs.length, 3);
      assert.ok(logs[2].msg.includes('info: HttpServer\n'));
      assert.ok(!logs[2].msg.includes('HttpServer[0]'));
      assert.deepEqual(logs[2].args, []);
    } finally {
      console.log = originalLog;
    }
  });
});
