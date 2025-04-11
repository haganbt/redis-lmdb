/**
 * Integration tests for Redis-LMDB using the official Node.js Redis client.
 * These tests verify that Redis-LMDB correctly implements Redis protocol
 * and can work with standard Redis clients.
 */

import { createClient } from 'redis';
import { beforeAll, afterAll, describe, test, expect } from '@jest/globals';
import { clearDatabase } from '../setup.js';
import net from 'net';
import path from 'path';
import { spawn } from 'child_process';

// Configuration
const PORT = 6379;
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
  jest.setTimeout(30000); // Increase timeout for the whole test
  
  // Clear database
  await clearDatabase();
  
  // Check if server is already running
  const portInUse = await isPortInUse(PORT);
  
  if (!portInUse) {
    // Start Redis-LMDB server
    console.log('Starting Redis-LMDB server...');
    server = spawn('node', ['src/server.js'], { 
      stdio: 'pipe', 
      detached: false 
    });
    
    // Output server logs for debugging
    server.stdout.on('data', (data) => {
      console.log(`Server stdout: ${data}`);
    });
    
    server.stderr.on('data', (data) => {
      console.error(`Server stderr: ${data}`);
    });
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Server should be ready');
  } else {
    console.log('Server is already running on port', PORT);
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
    server.kill();
    console.log('Server killed');
  }
});

describe('Redis SET command', () => {
  // Basic SET command test
  test('should set a string value', async () => {
    // Set a value
    const result = await client.set('testkey', 'testvalue');
    expect(result).toBe('OK');
    
    // Get the value to verify
    const value = await client.get('testkey');
    expect(value).toBe('testvalue');
  });
  
  // Test setting multiple different keys
  test('should set multiple different keys', async () => {
    await client.set('key1', 'value1');
    await client.set('key2', 'value2');
    
    const value1 = await client.get('key1');
    const value2 = await client.get('key2');
    
    expect(value1).toBe('value1');
    expect(value2).toBe('value2');
  });
  
  // Test overwriting an existing key
  test('should overwrite an existing key', async () => {
    // Set initial value
    await client.set('overwriteTest', 'initial');
    
    // Overwrite with new value
    await client.set('overwriteTest', 'updated');
    
    // Get the value to verify it was overwritten
    const value = await client.get('overwriteTest');
    expect(value).toBe('updated');
  });
  
  // Test setting an empty string value
  test('should handle empty string values', async () => {
    await client.set('emptyValue', '');
    
    const value = await client.get('emptyValue');
    expect(value).toBe('');
  });
  
  // Test setting a longer string value
  test('should handle longer string values', async () => {
    const longString = 'a'.repeat(1000);
    
    await client.set('longString', longString);
    
    const value = await client.get('longString');
    expect(value).toBe(longString);
    expect(value.length).toBe(1000);
  });
}); 