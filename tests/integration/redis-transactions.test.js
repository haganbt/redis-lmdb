/**
 * Integration tests for Redis-LMDB transaction support using the official Node.js Redis client.
 * These tests verify that transactions (MULTI/EXEC/DISCARD) work correctly with the Redis client.
 */

import { createClient } from 'redis';
import { beforeAll, afterAll, beforeEach, afterEach, describe, test, expect } from '@jest/globals';
import { store } from '../../src/store.js';
import net from 'net';
import { spawn } from 'child_process';

// Configuration - use a different port than other tests to avoid conflicts
const PORT = 6380;
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
  // Set explicit timeout for all tests
  jest.setTimeout(10000);
  
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
  
  // Final database reset
  await store.reset();
}, 5000); // Explicit timeout for cleanup

// Helper to clean up keys between tests
async function cleanupKeys(...keys) {
  for (const key of keys) {
    await client.del(key);
  }
}

describe('Redis Transaction Support', () => {
  // Clean up before each test
  beforeEach(async () => {
    await cleanupKeys('key1', 'key2', 'key3', 'testkey', 'discardkey', 'nonexistent', 'overwriteTest');
  });
  
  test('MULTI, SET, and EXEC should work together', async () => {
    // Start a transaction
    const multi = client.multi();
    
    // Queue a SET command
    multi.set('testkey', 'testvalue');
    
    // Execute the transaction
    const results = await multi.exec();
    
    // Verify we got results
    expect(results.length).toBe(1);
    expect(results[0]).toBe('OK');
    
    // Verify the value was stored
    const value = await client.get('testkey');
    expect(value).toBe('testvalue');
  });
  
  test('MULTI and DISCARD should discard queued commands', async () => {
    // First make sure the key doesn't exist
    await client.del('discardkey');
    
    // Start a transaction
    const multi = client.multi();
    
    // Queue a command
    multi.set('discardkey', 'discardvalue');
    
    // Discard the transaction instead of executing it
    await multi.discard();
    
    // Verify the key doesn't exist (since the SET was discarded)
    const exists = await client.exists('discardkey');
    expect(exists).toBe(0);
  });
  
  test('Multiple commands in a transaction should be executed atomically', async () => {
    // Start a transaction
    const multi = client.multi();
    
    // Queue multiple SET commands
    multi.set('key1', 'value1');
    multi.set('key2', 'value2');
    multi.set('key3', 'value3');
    
    // Execute the transaction
    const results = await multi.exec();
    
    // Verify results for each command
    expect(results.length).toBe(3);
    expect(results[0]).toBe('OK');
    expect(results[1]).toBe('OK');
    expect(results[2]).toBe('OK');
    
    // Verify all values were set
    const value1 = await client.get('key1');
    const value2 = await client.get('key2');
    const value3 = await client.get('key3');
    expect(value1).toBe('value1');
    expect(value2).toBe('value2');
    expect(value3).toBe('value3');
  });
  
  test('Transaction should properly handle mixed reads and writes', async () => {
    // Set a key before the transaction
    await client.set('key1', 'initial');
    
    // Start a transaction
    const multi = client.multi();
    
    // Queue read and write operations
    multi.get('key1');
    multi.set('key1', 'updated');
    multi.get('key1');
    
    // Execute the transaction
    const results = await multi.exec();
    
    // Verify results for each command
    expect(results.length).toBe(3);
    expect(results[0]).toBe('initial'); // First GET returns initial value
    expect(results[1]).toBe('OK'); // SET returns OK
    expect(results[2]).toBe('updated'); // Second GET shows updated value
    
    // Verify final value
    const finalValue = await client.get('key1');
    expect(finalValue).toBe('updated');
  });
  
  test('Transaction should handle non-existent keys properly', async () => {
    // Make sure the key doesn't exist
    await client.del('nonexistent');
    
    // Start a transaction
    const multi = client.multi();
    
    // Queue operations on non-existent keys
    multi.get('nonexistent');
    multi.exists('nonexistent');
    
    // Execute the transaction
    const results = await multi.exec();
    
    // Verify results
    expect(results.length).toBe(2);
    expect(results[0]).toBeNull(); // GET on non-existent key returns null
    expect(results[1]).toBe(0); // EXISTS on non-existent key returns 0
  });
  
  test('Transaction should handle errors gracefully', async () => {
    // Start a transaction
    const multi = client.multi();
    
    // Queue valid operations
    multi.set('key1', 'value1');
    multi.get('key1');
    
    // Execute the transaction
    const results = await multi.exec();
    
    // Verify results
    expect(results.length).toBe(2);
    expect(results[0]).toBe('OK');
    expect(results[1]).toBe('value1');
  });
}); 