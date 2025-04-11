#!/usr/bin/env node

/**
 * MMAP Performance Test for Redis-LMDB
 * 
 * This script tests MMAP performance by:
 * 1. Inserting >2GB of data to exceed memory limits
 * 2. Measuring read performance to test disk paging
 * 
 * Usage:
 *   node mmap-performance-test.js [--host=IP] [--port=PORT] [--total-size=SIZE_IN_MB] [--value-size=SIZE_IN_KB]
 * 
 * Example:
 *   node mmap-performance-test.js --host=3.145.141.48 --port=6379 --total-size=2048 --value-size=512
 */

import { createClient } from 'redis';
import { performance } from 'perf_hooks';
import { randomBytes } from 'crypto';
import { store } from '../src/store.js';

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  if (key && value) {
    acc[key.replace(/^--/, '')] = value;
  }
  return acc;
}, {});

// Check for environment variables
const envHost = process.env.host || process.env.HOST;

// Configuration with defaults
const config = {
  host: args.host || envHost || 'localhost',
  port: parseInt(args.port || process.env.port || process.env.PORT || '6379'),
  
  totalSizeMB: parseInt(args['total-size'] || '2048'),  // Default 2GB
  valueSizeKB: parseInt(args['value-size'] || '512'),   // Default 512KB per value
  batchSize: parseInt(args['batch-size'] || '10'),      // Default 10 keys per batch
  readSampleSize: parseInt(args['read-sample'] || '20') // Default 20% of keys for reading
};

// Calculate derived values
const valueSizeBytes = config.valueSizeKB * 1024;
const totalKeys = Math.ceil((config.totalSizeMB * 1024 * 1024) / valueSizeBytes);
const readSampleKeys = Math.ceil(totalKeys * (config.readSampleSize / 100));

/**
 * Generate a random string of specified size
 * @param {number} sizeInBytes - Size of the string in bytes
 * @returns {string} - Random string
 */
function generateRandomValue(sizeInBytes) {
  return randomBytes(sizeInBytes).toString('hex').substring(0, sizeInBytes);
}

/**
 * Format bytes to human readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

/**
 * Format a number with commas for thousands separator
 * @param {number} x - Number to format
 * @returns {string} - Formatted number
 */
function formatNumber(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format milliseconds to readable duration
 * @param {number} ms - Milliseconds
 * @returns {string} - Formatted duration
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms/1000).toFixed(2)}s`;
}

/**
 * Generate a well-formatted results summary
 * @param {Object} results - Test results
 * @returns {string} - Formatted summary
 */
function generateResultsSummary(results) {
  const { totalKeys, valueSizeBytes, writeTime, randomReadTime, scanTime, uniqueKeysScanned } = results;
  const totalBytes = totalKeys * valueSizeBytes;
  
  // Calculate performance metrics
  const writeOpsPerSec = totalKeys / (writeTime / 1000);
  const writeBytesPerSec = totalBytes / (writeTime / 1000);
  const randomReadOpsPerSec = results.readSampleKeys / (randomReadTime / 1000);
  const randomReadBytesPerSec = results.readSampleKeys * valueSizeBytes / (randomReadTime / 1000);
  const scanOpsPerSec = totalKeys / (scanTime / 1000); // This is operations based on total keys
  const scanBytesPerSec = totalBytes / (scanTime / 1000);
  
  // Format header
  let summary = '\n';
  summary += '┌───────────────────────────────────────────────────────────────────────────────────┐\n';
  summary += '│                             REDIS-LMDB MMAP PERFORMANCE TEST                          │\n';
  summary += '├────────────────────┬────────────────────┬────────────────────┬───────────────────┤\n';
  summary += '│ Test Configuration │ Value              │ Test Results       │ Value             │\n';
  summary += '├────────────────────┼────────────────────┼────────────────────┼───────────────────┤\n';
  
  // Configuration section
  summary += `│ Host               │ ${results.host.padEnd(18)} │ Total Data        │ ${formatBytes(totalBytes).padEnd(17)} │\n`;
  summary += `│ Port               │ ${results.port.toString().padEnd(18)} │ Total Keys        │ ${formatNumber(totalKeys).padEnd(17)} │\n`;
  summary += `│ Value Size         │ ${formatBytes(valueSizeBytes).padEnd(18)} │ Sample Size       │ ${formatNumber(results.readSampleKeys).padEnd(17)} │\n`;
  if (uniqueKeysScanned !== undefined) {
    summary += `│                    │                    │ Unique Keys Found │ ${formatNumber(uniqueKeysScanned).padEnd(17)} │\n`;
  }
  summary += '├────────────────────┴────────────────────┴────────────────────┴───────────────────┤\n';
  
  // Performance results
  summary += '│                                PERFORMANCE RESULTS                                │\n';
  summary += '├────────────────────┬───────────────┬──────────────────┬──────────────────────────┤\n';
  summary += '│ Operation          │ Duration      │ Throughput       │ Data Rate                │\n';
  summary += '│                    │               │ (ops/sec)        │                          │\n';
  summary += '├────────────────────┼───────────────┼──────────────────┼──────────────────────────┤\n';
  summary += `│ Write              │ ${formatDuration(writeTime).padEnd(13)} │ ${writeOpsPerSec.toFixed(2).padEnd(16)} │ ${formatBytes(writeBytesPerSec).padEnd(24)} │\n`;
  summary += `│ Random Read        │ ${formatDuration(randomReadTime).padEnd(13)} │ ${randomReadOpsPerSec.toFixed(2).padEnd(16)} │ ${formatBytes(randomReadBytesPerSec).padEnd(24)} │\n`;
  summary += `│ Sequential Scan    │ ${formatDuration(scanTime).padEnd(13)} │ ${scanOpsPerSec.toFixed(2).padEnd(16)} │ ${formatBytes(scanBytesPerSec).padEnd(24)} │\n`;
  summary += '└────────────────────┴───────────────┴──────────────────┴──────────────────────────┘\n';
  
  return summary;
}

/**
 * Run MMAP performance test
 */
async function runPerformanceTest() {
  console.log(`\n=== REDIS-LMDB MMAP PERFORMANCE TEST ===`);
  console.log(`Host: ${config.host}:${config.port}`);
  console.log(`Total Data Size: ${formatBytes(config.totalSizeMB * 1024 * 1024)}`);
  console.log(`Value Size: ${formatBytes(valueSizeBytes)}`);
  console.log(`Total Keys: ${totalKeys}`);
  console.log(`Read Sample Size: ${readSampleKeys} keys (${config.readSampleSize}%)`);
  console.log(`Batch Size: ${config.batchSize} operations per batch\n`);
  
  // Prepare results object to collect data
  const results = {
    host: config.host,
    port: config.port,
    totalKeys: totalKeys,
    valueSizeBytes: valueSizeBytes,
    readSampleKeys: readSampleKeys,
    writeTime: 0,
    randomReadTime: 0,
    scanTime: 0
  };

  // Connect to Redis
  const client = createClient({
    socket: {
      host: config.host,
      port: config.port,
    }
  });

  client.on('error', (err) => {
    console.error('Redis Client Error:', err);
    process.exit(1);
  });

  // Test keys will be in format: mmap_test_{timestamp}_{index}
  const keyPrefix = `mmap_test_${Date.now()}_`;
  const allKeys = Array.from({ length: totalKeys }, (_, i) => `${keyPrefix}${i}`);
  
  // Prepare a sample of keys that we'll read back (randomly distributed)
  const sampleKeys = [];
  for (let i = 0; i < readSampleKeys; i++) {
    const randomIndex = Math.floor(Math.random() * totalKeys);
    sampleKeys.push(allKeys[randomIndex]);
  }

  // Generate a reusable value template to save memory during test
  const valueTemplate = generateRandomValue(valueSizeBytes);

  try {
    console.log('Connecting to Redis-LMDB server...');
    await client.connect();
    console.log('Connected successfully\n');

    // First, ensure the server is empty of our test keys
    console.log('Cleaning up any existing test data...');
    const cleanupStart = performance.now();
    await cleanupKeys(client, keyPrefix);
    const cleanupTime = performance.now() - cleanupStart;
    console.log(`Cleanup completed in ${cleanupTime.toFixed(2)}ms\n`);

    // WRITE TEST
    console.log(`=== STARTING WRITE TEST (${totalKeys} keys, ${formatBytes(config.totalSizeMB * 1024 * 1024)} total) ===`);
    const writeStart = performance.now();
    
    // Track progress
    let completedWrites = 0;
    const progressInterval = Math.max(1, Math.floor(totalKeys / 20)); // Show progress ~20 times
    
    // Write in batches to avoid memory issues
    for (let i = 0; i < totalKeys; i += config.batchSize) {
      const batch = client.multi();
      const end = Math.min(i + config.batchSize, totalKeys);
      
      for (let j = i; j < end; j++) {
        batch.set(allKeys[j], valueTemplate);
      }
      
      await batch.exec();
      completedWrites += (end - i);
      
      // Show progress periodically
      if (completedWrites % progressInterval === 0 || completedWrites === totalKeys) {
        const percent = ((completedWrites / totalKeys) * 100).toFixed(1);
        const elapsed = ((performance.now() - writeStart) / 1000).toFixed(1);
        console.log(`Write progress: ${completedWrites}/${totalKeys} keys (${percent}%) - ${elapsed}s elapsed`);
      }
    }
    
    const writeTime = performance.now() - writeStart;
    console.log(`\nWrite test completed in ${(writeTime / 1000).toFixed(2)}s`);
    console.log(`Write throughput: ${(totalKeys / (writeTime / 1000)).toFixed(2)} ops/sec, ${formatBytes((totalKeys * valueSizeBytes) / (writeTime / 1000))}/sec`);
    results.writeTime = writeTime;

    // Let the system stabilize and flush data to disk
    console.log('Waiting for system to stabilize (5s)...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // RANDOM ACCESS READ TEST
    console.log(`\n=== STARTING RANDOM ACCESS READ TEST (${readSampleKeys} keys) ===`);
    const randomReadStart = performance.now();
    
    // Track progress
    let completedRandomReads = 0;
    const randomProgressInterval = Math.max(1, Math.floor(readSampleKeys / 10)); // Show progress ~10 times
    
    // Read in batches
    for (let i = 0; i < readSampleKeys; i += config.batchSize) {
      const batch = client.multi();
      const end = Math.min(i + config.batchSize, readSampleKeys);
      
      for (let j = i; j < end; j++) {
        batch.get(sampleKeys[j]);
      }
      
      await batch.exec();
      completedRandomReads += (end - i);
      
      // Show progress periodically
      if (completedRandomReads % randomProgressInterval === 0 || completedRandomReads === readSampleKeys) {
        const percent = ((completedRandomReads / readSampleKeys) * 100).toFixed(1);
        const elapsed = ((performance.now() - randomReadStart) / 1000).toFixed(1);
        console.log(`Random read progress: ${completedRandomReads}/${readSampleKeys} keys (${percent}%) - ${elapsed}s elapsed`);
      }
    }
    
    const randomReadTime = performance.now() - randomReadStart;
    console.log(`\nRandom read test completed in ${(randomReadTime / 1000).toFixed(2)}s`);
    console.log(`Random read throughput: ${(readSampleKeys / (randomReadTime / 1000)).toFixed(2)} ops/sec, ${formatBytes((readSampleKeys * valueSizeBytes) / (randomReadTime / 1000))}/sec`);
    results.randomReadTime = randomReadTime;

    // SEQUENTIAL SCAN TEST (forces MMAP paging)
    console.log(`\n=== STARTING SEQUENTIAL SCAN TEST (all ${totalKeys} keys) ===`);
    const scanStart = performance.now();
    
    // Using the SCAN command to iterate through all keys with our prefix
    let cursor = '0';
    let scannedKeys = 0;
    let scanIterations = 0;
    let uniqueScannedKeys = new Set(); // Track unique keys to avoid double counting
    const MAX_SCAN_ITERATIONS = 100; // Safety limit
    const scanProgressInterval = Math.max(1, Math.floor(totalKeys / 10)); // Show progress ~10 times
    
    console.log(`Starting scan with cursor: ${cursor}`);
    do {
      console.log(`Scan iteration ${scanIterations+1}, cursor: ${cursor}`);
      try {
        const result = await client.scan(cursor, {
          MATCH: `${keyPrefix}*`,
          COUNT: 1000
        });
        
        // Store the new cursor
        cursor = result.cursor;
        const keys = result.keys;
        
        console.log(`Scan returned cursor: ${cursor}, found ${keys.length} keys`);
        
        if (keys.length > 0) {
          // Get values for these keys
          const batch = client.multi();
          for (const key of keys) {
            batch.get(key);
            uniqueScannedKeys.add(key); // Add to set of unique keys
          }
          await batch.exec();
          
          // Increment raw counter for throughput calculation
          scannedKeys += keys.length;
          
          // Show progress periodically based on unique keys
          const uniqueKeyCount = uniqueScannedKeys.size;
          const uniquePercent = Math.min(100, ((uniqueKeyCount / totalKeys) * 100).toFixed(1));
          
          // Show both raw and unique key counts for transparency
          if (scanIterations % 5 === 0 || cursor === '0') {
            const elapsed = ((performance.now() - scanStart) / 1000).toFixed(1);
            console.log(`Scan progress: ${uniqueKeyCount}/${totalKeys} unique keys (${uniquePercent}%), ${scannedKeys} total operations - ${elapsed}s elapsed`);
          }
        }
        
        // Safety check to prevent infinite loops
        scanIterations++;
        if (scanIterations >= MAX_SCAN_ITERATIONS) {
          console.warn(`Reached maximum scan iterations (${MAX_SCAN_ITERATIONS}), breaking loop`);
          break;
        }
        
        // If we're stuck on the same cursor, break
        if (scanIterations > 5 && cursor === '0' && keys.length === 0) {
          console.warn('Scan appears to be returning empty results with cursor 0, breaking loop');
          break;
        }
      } catch (error) {
        console.error(`Error during scan operation: ${error.message}`);
        break;
      }
    } while (cursor !== '0' || scanIterations < 5); // Always do at least 5 iterations to be safe
    
    const scanTime = performance.now() - scanStart;
    console.log(`\nSequential scan test completed in ${(scanTime / 1000).toFixed(2)}s`);
    // Use uniqueScannedKeys.size for accurate reporting in summary
    results.uniqueKeysScanned = uniqueScannedKeys.size;
    console.log(`Scan throughput: ${(scannedKeys / (scanTime / 1000)).toFixed(2)} ops/sec (includes duplicate keys), ${formatBytes((scannedKeys * valueSizeBytes) / (scanTime / 1000))}/sec`);
    console.log(`Unique keys scanned: ${uniqueScannedKeys.size}/${totalKeys} (${((uniqueScannedKeys.size / totalKeys) * 100).toFixed(1)}%)`);
    results.scanTime = scanTime;

    // Display well-formatted results summary
    console.log(generateResultsSummary(results));

    // Cleanup if needed
    if (process.env.SKIP_CLEANUP !== 'true') {
      console.log('\nCleaning up test data...');
      await cleanupKeys(client, keyPrefix);
      console.log('Cleanup completed');
    } else {
      console.log('\nSkipping cleanup as SKIP_CLEANUP=true');
    }

  } catch (error) {
    console.error('Error during performance test:', error);
  } finally {
    // Close the connection
    await client.disconnect();
    console.log('Disconnected from Redis');
  }
}

/**
 * Clean up keys with the given prefix
 * @param {Object} client - Redis client
 * @param {string} prefix - Key prefix to match
 */
async function cleanupKeys(client, prefix) {
  console.log('Using store.reset() to clean database completely...');
  
  try {
    const resetStart = performance.now();
    // Call store.reset() directly to wipe the database
    const success = await store.reset();
    const resetTime = performance.now() - resetStart;
    
    if (success) {
      console.log(`Database reset successfully in ${resetTime.toFixed(2)}ms`);
      return true;
    } else {
      console.error('Failed to reset database');
      
      // Fallback to traditional cleanup if reset fails
      console.log('Falling back to traditional cleanup...');
      return await traditionalCleanup(client, prefix);
    }
  } catch (error) {
    console.error(`Error during database reset: ${error.message}`);
    console.log('Falling back to traditional cleanup...');
    return await traditionalCleanup(client, prefix);
  }
}

/**
 * Traditional cleanup method by scanning and deleting keys
 * @param {Object} client - Redis client
 * @param {string} prefix - Key prefix to match
 */
async function traditionalCleanup(client, prefix) {
  let cursor = '0';
  let deleted = 0;
  let scanIterations = 0;
  const MAX_ITERATIONS = 100; // Safety limit
  
  do {
    console.log(`Scanning with cursor: ${cursor}`);
    try {
      const result = await client.scan(cursor, {
        MATCH: `${prefix}*`,
        COUNT: 1000
      });
      
      cursor = result.cursor;
      const keys = result.keys;
      
      console.log(`Found ${keys.length} keys to delete, next cursor: ${cursor}`);
      
      if (keys.length > 0) {
        // Delete keys in smaller batches to avoid overwhelming the server
        const BATCH_SIZE = 50;
        for (let i = 0; i < keys.length; i += BATCH_SIZE) {
          const batch = keys.slice(i, i + BATCH_SIZE);
          try {
            await client.del(batch);
            deleted += batch.length;
            console.log(`Deleted ${deleted} keys so far`);
          } catch (deleteError) {
            console.error(`Error deleting batch of keys: ${deleteError.message}`);
            // Continue with the next batch even if this one failed
          }
        }
      }
      
      // Safety check to prevent infinite loops with same cursor
      if (cursor === '0' && keys.length === 0) {
        // We're done
        break;
      }
      
    } catch (scanError) {
      console.error(`Error during scan operation: ${scanError.message}`);
      // Try to continue with a fresh cursor
      cursor = '0';
    }
    
    // Safety check to prevent infinite loops
    scanIterations++;
    if (scanIterations >= MAX_ITERATIONS) {
      console.warn(`Reached maximum cleanup iterations (${MAX_ITERATIONS}), breaking loop`);
      break;
    }
  } while (cursor !== '0' || scanIterations < 5); // Always do at least 5 iterations to be safe
  
  console.log(`Total deleted: ${deleted} keys`);
  return deleted;
}

/**
 * Format throughput values to human readable format
 * @param {number} count - Number of operations
 * @param {number} sizeBytes - Size of each operation in bytes
 * @param {number} timeMs - Time taken in milliseconds
 * @returns {string} - Formatted throughput string
 */
function formatThroughput(count, sizeBytes, timeMs) {
  const opsPerSec = (count / (timeMs / 1000)).toFixed(2);
  const bytesPerSec = (count * sizeBytes) / (timeMs / 1000);
  return `${opsPerSec} ops/sec, ${formatBytes(bytesPerSec)}/sec`;
}

// Run the test
runPerformanceTest()
  .then(() => {
    console.log('Performance test completed');
    process.exit(0);
  })
  .catch(err => {
    console.error('Unhandled error in performance test:', err);
    process.exit(1);
  }); 