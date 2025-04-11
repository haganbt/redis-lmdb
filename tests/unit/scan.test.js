/**
 * Unit tests for the SCAN command
 */

import { describe, test, expect, jest } from '@jest/globals';
import scan from '../../src/commands/scan.js';
import { store } from '../../src/store.js';

// Helper to parse RESP response from scan command
const parseScanResponse = (respString) => {
  // Parse the RESP array format returned by scan command
  // Format: *2\r\n$1\r\n0\r\n*3\r\n$4\r\nkey1\r\n$4\r\nkey2\r\n$4\r\nkey3\r\n
  
  const lines = respString.split('\r\n');
  
  // First element is the cursor
  // Format: $X\r\nCURSOR\r\n
  const cursorLength = parseInt(lines[1].substring(1), 10);
  const cursor = lines[2].substring(0, cursorLength);
  
  // Second element is the array of keys
  // Format: *N\r\n$(len1)\r\nkey1\r\n$(len2)\r\nkey2\r\n...
  const keyCount = parseInt(lines[3].substring(1), 10);
  const keys = [];
  
  for (let i = 0; i < keyCount; i++) {
    const keyIndex = 4 + (i * 2);
    if (keyIndex + 1 < lines.length) {
      keys.push(lines[keyIndex + 1]);
    }
  }
  
  return { cursor, keys };
};

// Mock the store.scan method
jest.spyOn(store, 'scan').mockImplementation((cursor, pattern, count) => {
  // Mock database with test keys
  const mockDb = [
    'key1', 'key2', 'test1', 'test2', 'abc', 'xyz',
    ...Array.from({ length: 50 }, (_, i) => `pagination_key_${i + 1}`)
  ];
  
  // Filter by pattern
  let matchingKeys = mockDb;
  if (pattern !== '*') {
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") 
      .replace(/\*/g, ".*")                 
      .replace(/\?/g, ".");  
    const regex = new RegExp("^" + regexPattern + "$");
    matchingKeys = mockDb.filter(key => regex.test(key));
  }
  
  // Handle pagination
  const pageSize = count || 10;
  let startIdx = 0;
  
  // If cursor is not 0, it represents the starting index
  if (cursor !== 0) {
    startIdx = cursor;
  }
  
  // Get the current page of results
  const endIdx = Math.min(startIdx + pageSize, matchingKeys.length);
  const keysForThisPage = matchingKeys.slice(startIdx, endIdx);
  
  // Calculate next cursor
  const nextCursor = endIdx < matchingKeys.length ? endIdx : 0;
  
  return {
    nextCursor,
    keys: keysForThisPage
  };
});

describe('SCAN Command', () => {
  // Basic scan test
  test('should return keys with cursor', async () => {
    // Start a new scan
    const mockClient = {};
    const result = await scan(mockClient, '0');
    
    // Check that the result is a RESP string
    expect(typeof result).toBe('string');
    expect(result.startsWith('*2\r\n')).toBe(true);
    
    // Parse the RESP response
    const { cursor, keys } = parseScanResponse(result);
    
    // Validate cursor and keys
    expect(cursor).toBeDefined();
    expect(Array.isArray(keys)).toBe(true);
    expect(keys.length).toBeGreaterThan(0);
    
    // Complete iteration to get all keys
    let allKeys = [...keys];
    let currentCursor = cursor;
    
    // Limit iterations to prevent infinite loops
    let iterations = 0;
    const MAX_ITERATIONS = 10;
    
    while (currentCursor !== '0' && iterations < MAX_ITERATIONS) {
      const nextResult = await scan(mockClient, currentCursor);
      const parsedResult = parseScanResponse(nextResult);
      currentCursor = parsedResult.cursor;
      allKeys = [...allKeys, ...parsedResult.keys];
      iterations++;
    }
    
    // Verify we got all 56 keys (6 named keys + 50 pagination keys)
    expect(allKeys.length).toBe(56);
  });
  
  // Test with MATCH pattern
  test('should filter keys by pattern', async () => {
    // Scan with MATCH test*
    const result = await scan({}, '0', 'MATCH', 'test*');
    
    // Parse the RESP response
    const { cursor, keys } = parseScanResponse(result);
    
    // Complete iteration
    let allKeys = [...keys];
    let currentCursor = cursor;
    
    // Limit iterations to prevent infinite loops
    let iterations = 0;
    const MAX_ITERATIONS = 10;
    
    while (currentCursor !== '0' && iterations < MAX_ITERATIONS) {
      const nextResult = await scan({}, currentCursor, 'MATCH', 'test*');
      const parsedResult = parseScanResponse(nextResult);
      currentCursor = parsedResult.cursor;
      allKeys = [...allKeys, ...parsedResult.keys];
      iterations++;
    }
    
    // Should return only test1 and test2
    expect(allKeys.length).toBe(2);
    expect(allKeys).toContain('test1');
    expect(allKeys).toContain('test2');
  });
  
  // Test with COUNT option
  test('should respect COUNT hint', async () => {
    // Scan with COUNT 20
    const result = await scan({}, '0', 'COUNT', '20');
    
    // Parse the RESP response
    const { keys } = parseScanResponse(result);
    
    // Verify it returns approximately the requested count
    expect(keys.length).toBeLessThanOrEqual(20);
    
    // For large enough COUNT, a single call should return all keys matching pagination_key_*
    const paginationResult = await scan({}, '0', 'MATCH', 'pagination_key_*', 'COUNT', '100');
    
    // Parse the RESP response
    const paginationParsed = parseScanResponse(paginationResult);
    
    // Complete iteration
    let allKeys = [...paginationParsed.keys];
    let currentCursor = paginationParsed.cursor;
    
    // Limit iterations to prevent infinite loops
    let iterations = 0;
    const MAX_ITERATIONS = 10;
    
    while (currentCursor !== '0' && iterations < MAX_ITERATIONS) {
      const nextResult = await scan({}, currentCursor, 'MATCH', 'pagination_key_*', 'COUNT', '100');
      const parsedResult = parseScanResponse(nextResult);
      currentCursor = parsedResult.cursor;
      allKeys = [...allKeys, ...parsedResult.keys];
      iterations++;
    }
    
    // Should return all 50 pagination keys
    expect(allKeys.length).toBe(50);
    allKeys.forEach(key => {
      expect(key.startsWith('pagination_key_')).toBe(true);
    });
  });
  
  // Test with invalid cursor
  test('should handle invalid cursor gracefully', async () => {
    // Test with negative cursor
    const negativeResult = await scan({}, '-1');
    const negativeData = parseScanResponse(negativeResult);
    expect(negativeData.cursor).not.toBe('-1'); // Should start a new scan
    
    // Test with non-existent cursor
    const nonExistentResult = await scan({}, '999999');
    const nonExistentData = parseScanResponse(nonExistentResult);
    expect(nonExistentData.cursor).not.toBe('999999'); // Should start a new scan
    
    // Test with non-numeric cursor
    const nonNumericResult = await scan({}, 'not-a-cursor');
    const nonNumericData = parseScanResponse(nonNumericResult);
    expect(nonNumericData.cursor).not.toBe('not-a-cursor'); // Should start a new scan
  });
}); 