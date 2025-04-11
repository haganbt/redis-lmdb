/**
 * Debug script to test the SCAN command directly
 */

import { createClient } from 'redis';
import { store } from './src/store.js';
import { spawn } from 'child_process';
import net from 'net';

// Use a unique port for testing
const PORT = 6384;
let server;
let client;

// Helper to check if a server is ready
const waitForServer = async (port, retries = 5, delay = 500) => {
  for (let i = 0; i < retries; i++) {
    try {
      const socket = new net.Socket();
      const connectPromise = new Promise((resolve, reject) => {
        socket.once('connect', () => {
          socket.end();
          resolve(true);
        });
        socket.once('error', reject);
      });
      
      socket.connect(port, 'localhost');
      await connectPromise;
      console.log(`Server is ready on port ${port}`);
      return true;
    } catch (error) {
      console.log(`Waiting for server to be ready (attempt ${i+1}/${retries})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error(`Server not ready on port ${port} after ${retries} attempts`);
};

// Helper to add test keys
const addTestKeys = async (client) => {
  console.log('Adding test keys...');
  const pipeline = client.multi();
  
  // Add some test keys with different patterns
  for (let i = 1; i <= 10; i++) {
    pipeline.set(`test_key_${i}`, `value_${i}`);
  }
  
  // Add some user keys
  pipeline.set('user:1', 'Alice');
  pipeline.set('user:2', 'Bob');
  pipeline.set('user:3', 'Charlie');
  
  // Add some product keys
  pipeline.set('product:1', 'Laptop');
  pipeline.set('product:2', 'Phone');
  
  // Execute the pipeline
  await pipeline.exec();
  console.log('Added test keys');
  
  // Verify with KEYS
  const keys = await client.keys('*');
  console.log(`Found ${keys.length} keys in database`);
  console.log('Keys:', keys);
};

// Test scan command
const testScan = async (client) => {
  console.log('\n--- Testing basic SCAN ---');
  try {
    const result = await client.scan(0);
    console.log('SCAN result:', result);
    console.log('SCAN cursor:', result.cursor);
    console.log('SCAN keys:', result.keys);
    console.log('SCAN keys count:', result.keys.length);
  } catch (error) {
    console.error('Error executing SCAN:', error);
  }
  
  console.log('\n--- Testing SCAN with MATCH ---');
  try {
    const result = await client.scan(0, {
      MATCH: 'user:*'
    });
    console.log('SCAN with MATCH result:', result);
    console.log('SCAN with MATCH cursor:', result.cursor);
    console.log('SCAN with MATCH keys:', result.keys);
    console.log('SCAN with MATCH keys count:', result.keys.length);
  } catch (error) {
    console.error('Error executing SCAN with MATCH:', error);
  }
  
  console.log('\n--- Testing SCAN with COUNT ---');
  try {
    const result = await client.scan(0, {
      COUNT: 3
    });
    console.log('SCAN with COUNT result:', result);
    console.log('SCAN with COUNT cursor:', result.cursor);
    console.log('SCAN with COUNT keys:', result.keys);
    console.log('SCAN with COUNT keys count:', result.keys.length);
  } catch (error) {
    console.error('Error executing SCAN with COUNT:', error);
  }
};

// Main execution function
const run = async () => {
  try {
    console.log('Resetting database...');
    await store.reset();
    
    console.log(`Starting Redis-LMDB server on port ${PORT}...`);
    server = spawn('node', ['src/server.js', '--port', PORT.toString()], {
      stdio: 'pipe',
      detached: false
    });
    
    server.stdout.on('data', (data) => {
      console.log(`SERVER OUT: ${data.toString().trim()}`);
    });
    
    server.stderr.on('data', (data) => {
      console.log(`SERVER ERR: ${data.toString().trim()}`);
    });
    
    // Wait for server to be ready
    await waitForServer(PORT);
    
    // Create Redis client
    console.log('Creating Redis client...');
    client = createClient({
      socket: {
        host: 'localhost',
        port: PORT,
      }
    });
    
    // Error handler
    client.on('error', (err) => console.error('Redis client error:', err));
    
    // Connect to server
    console.log('Connecting to server...');
    await client.connect();
    console.log('Connected to server');
    
    // Add test keys
    await addTestKeys(client);
    
    // Test SCAN command
    await testScan(client);
    
    // Clean up
    console.log('\n--- Cleaning up ---');
    if (client && client.isOpen) {
      console.log('Disconnecting Redis client...');
      await client.disconnect();
      console.log('Redis client disconnected');
    }
    
    if (server) {
      console.log('Killing server...');
      server.kill();
      console.log('Server killed');
    }
    
    console.log('Final database reset...');
    await store.reset();
    
    console.log('Test completed successfully');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    process.exit(0);
  }
};

// Run the test
run(); 