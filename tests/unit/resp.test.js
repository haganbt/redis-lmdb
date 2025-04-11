import { jest } from '@jest/globals';
import { parseRESP, respOK, respError, respInteger, respBulk, respArray } from '../../src/resp.js';

describe('RESP Protocol Implementation', () => {
  describe('Message Encoding', () => {
    test('should encode simple strings correctly', () => {
      expect(respOK()).toBe('+OK\r\n');
    });

    test('should encode error messages correctly', () => {
      expect(respError('ERR unknown command')).toBe('-ERR unknown command\r\n');
    });

    test('should encode integers correctly', () => {
      expect(respInteger(1000)).toBe(':1000\r\n');
      expect(respInteger(-1)).toBe(':-1\r\n');
      expect(respInteger(0)).toBe(':0\r\n');
    });

    test('should encode bulk strings correctly', () => {
      expect(respBulk('foobar')).toBe('$6\r\nfoobar\r\n');
      expect(respBulk('')).toBe('$0\r\n\r\n');
      expect(respBulk(null)).toBe('$-1\r\n');
    });

    test('should encode arrays correctly', () => {
      expect(respArray(['foo', 'bar'])).toBe('*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n');
      expect(respArray([])).toBe('*0\r\n');
    });

    test('should handle binary data in bulk strings', () => {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      expect(respBulk(binaryData)).toBe('$4\r\n\x00\x01\x02\x03\r\n');
    });
  });

  describe('Message Parsing', () => {
    test('should parse simple array messages', () => {
      const message = '*3\r\n$3\r\nSET\r\n$3\r\nfoo\r\n$3\r\nbar\r\n';
      const result = parseRESP(Buffer.from(message));
      expect(result).toEqual(['SET', 'foo', 'bar']);
    });

    test('should handle empty arrays', () => {
      const message = '*0\r\n';
      const result = parseRESP(Buffer.from(message));
      expect(result).toEqual([]);
    });

    test('should handle empty bulk strings', () => {
      const message = '*2\r\n$0\r\n\r\n$3\r\nfoo\r\n';
      const result = parseRESP(Buffer.from(message));
      expect(result).toEqual(['', 'foo']);
    });

    test('should handle null bulk strings', () => {
      const message = '*2\r\n$-1\r\n$3\r\nfoo\r\n';
      const result = parseRESP(Buffer.from(message));
      expect(result).toEqual([null, 'foo']);
    });

    test('should handle binary data', () => {
      const message = '*2\r\n$4\r\n\x00\x01\x02\x03\r\n$3\r\nfoo\r\n';
      const result = parseRESP(Buffer.from(message));
      expect(result[0]).toEqual(Buffer.from([0x00, 0x01, 0x02, 0x03]).toString());
      expect(result[1]).toBe('foo');
    });
  });

  describe('Error Handling', () => {
    test('should return null for invalid array format', () => {
      const message = '*3\r\n$3\r\nSET\r\n$3\r\nfoo\r\n'; // Missing last argument
      const result = parseRESP(Buffer.from(message));
      expect(result).toBeNull();
    });

    test('should return null for invalid bulk string length', () => {
      const message = '*2\r\n$3\r\nSET\r\n$4\r\nfoo\r\n'; // Length mismatch
      const result = parseRESP(Buffer.from(message));
      expect(result).toBeNull();
    });

    test('should return null for non-array messages', () => {
      const message = '+OK\r\n';
      const result = parseRESP(Buffer.from(message));
      expect(result).toBeNull();
    });

    test('should return null for malformed messages', () => {
      const message = '*2\r\n$3\r\nSET\r\n$3\r\nfoo'; // Missing \r\n
      const result = parseRESP(Buffer.from(message));
      expect(result).toBeNull();
    });
  });

  describe('Protocol Compliance', () => {
    test('should maintain proper line endings', () => {
      const message = '*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n';
      const result = parseRESP(Buffer.from(message));
      expect(result).toEqual(['foo', 'bar']);
    });

    test('should handle multiple messages in buffer', () => {
      const messages = '*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n*1\r\n$3\r\nbaz\r\n';
      const result = parseRESP(Buffer.from(messages));
      expect(result).toEqual(['foo', 'bar']);
    });
  });

  describe('Client Compatibility', () => {
    test('should handle Redis client command format', () => {
      // Simulate a SET command from a Redis client
      const message = '*3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n';
      const result = parseRESP(Buffer.from(message));
      expect(result).toEqual(['SET', 'key', 'value']);
    });

    test('should handle Redis client transaction format', () => {
      // Simulate a MULTI command from a Redis client
      const message = '*1\r\n$5\r\nMULTI\r\n';
      const result = parseRESP(Buffer.from(message));
      expect(result).toEqual(['MULTI']);
    });

    test('should handle Redis client pipeline format', () => {
      // Simulate a pipeline of commands with proper arguments
      const message = '*3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n';
      const result = parseRESP(Buffer.from(message));
      expect(result).toEqual(['SET', 'key', 'value']);
    });

    test('should handle HELLO command format', () => {
      // Simulate a HELLO command with protocol version
      const message = '*2\r\n$5\r\nHELLO\r\n$1\r\n3\r\n';
      const result = parseRESP(Buffer.from(message));
      expect(result).toEqual(['HELLO', '3']);
    });
  });
}); 