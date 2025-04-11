/**
 * Basic integration tests for Redis-LMDB using the official Node.js Redis client.
 * These tests verify that Redis-LMDB correctly implements the basic SET and GET commands
 * and maintains compatibility with standard Redis clients.
 */

import { createClient } from 'redis';
import { beforeAll, afterAll, describe, test, expect } from '@jest/globals';
import { store } from '../../src/store.js';
import net from 'net';
import { spawn } from 'child_process';

// Configuration - use a different port than other tests to avoid conflicts
const PORT = 6382;
let server;
let client;

// Helper function to check if port is in use
const isPortInUse = (port) => 
  new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => {
        tester.close();
        resolve(false);
      })
      .listen(port);
  });

// Start the Redis-LMDB server before tests
beforeAll(async () => {
  jest.setTimeout(10000); // Set a reasonable timeout for all tests
  
  // Reset the database
  await store.reset();
  
  // Check if server is already running
  const portInUse = await isPortInUse(PORT);
  
  if (!portInUse) {
    // Start Redis-LMDB server with custom port
    console.log(`Starting Redis-LMDB server on port ${PORT}...`);
    server = spawn('node', ['src/server.js', '--port', PORT.toString()], { 
      stdio: 'pipe', 
      detached: false 
    });
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Server should be ready');
  } else {
    console.log(`Server is already running on port ${PORT}`);
  }
  
  try {
    // Create Redis client
    console.log('Creating Redis client...');
    client = createClient({
      socket: {
        host: 'localhost',
        port: PORT,
      }
    });
    
    // Set up event handlers
    client.on('error', (err) => console.error('Redis client error:', err));
    
    // Connect to the server
    console.log('Connecting to server...');
    await client.connect();
    console.log('Connected to server');
  } catch (err) {
    console.error('Failed to connect Redis client:', err);
    throw err;
  }
});

// Close client and server after tests
afterAll(async () => {
  console.log('Cleaning up after tests...');
  
  // Disconnect client
  if (client) {
    try {
      await client.disconnect();
      console.log('Redis client disconnected');
    } catch (err) {
      console.error('Error disconnecting Redis client:', err);
    }
  }
  
  // Kill server if we started it
  if (server) {
    console.log('Killing server...');
    server.kill();
    
    // Give the server a moment to shut down
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('Server killed');
  }
  
  // Reset the database
  await store.reset();
}, 5000); // Set a timeout for cleanup

// Helper to clean up keys between tests
async function cleanupKeys(...keys) {
  for (const key of keys) {
    await client.del(key);
  }
}

describe('Basic Redis Commands', () => {
  // Clean up after each test
  afterEach(async () => {
    await cleanupKeys('testkey', 'emptyValue', 'longString', 'overwriteTest', 'delkey', 'existskey');
  });
  
  // SET and GET commands
  describe('SET command', () => {
    test('should set and get a string value', async () => {
      const result = await client.set('testkey', 'testvalue');
      expect(result).toBe('OK');
      
      const value = await client.get('testkey');
      expect(value).toBe('testvalue');
    });
    
    test('should handle empty string values', async () => {
      await client.set('emptyValue', '');
      
      const value = await client.get('emptyValue');
      expect(value).toBe('');
    });
    
    test('should handle longer string values', async () => {
      const longString = 'a'.repeat(1000);
      
      await client.set('longString', longString);
      
      const value = await client.get('longString');
      expect(value).toBe(longString);
      expect(value.length).toBe(1000);
    });
    
    test('should return null for non-existent keys', async () => {
      const value = await client.get('nonexistentkey');
      expect(value).toBeNull();
    });
    
    test('should overwrite an existing key', async () => {
      // Set initial value
      await client.set('overwriteTest', 'initial');
      
      // Overwrite with new value
      await client.set('overwriteTest', 'updated');
      
      // Get the value to verify it was overwritten
      const value = await client.get('overwriteTest');
      expect(value).toBe('updated');
    });
  });
  
  // DEL command
  describe('DEL command - single key', () => {
    test('should delete a key', async () => {
      await client.set('delkey', 'value');
      
      // Verify key exists
      let value = await client.get('delkey');
      expect(value).toBe('value');
      
      // Delete the key
      const delResult = await client.del('delkey');
      expect(delResult).toBe(1);
      
      // Verify key no longer exists
      value = await client.get('delkey');
      expect(value).toBeNull();
    });
    
    test('should return 0 when deleting non-existent key', async () => {
      const delResult = await client.del('nonexistentkey');
      expect(delResult).toBe(0);
    });
  });
  
  // EXISTS command
  describe('EXISTS command - single key', () => {
    test('should check if a key exists', async () => {
      await client.set('existskey', 'value');
      
      const exists = await client.exists('existskey');
      expect(exists).toBe(1);
    });
    
    test('should return 0 for non-existent key', async () => {
      const exists = await client.exists('nonexistentkey');
      expect(exists).toBe(0);
    });
  });
}); 