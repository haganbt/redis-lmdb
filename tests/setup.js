// Import store to reset the database
import { store } from '../src/store.js';
import fs from 'fs';
import path from 'path';

// Default database path (matches the one in store.js)
const dbPath = process.env.LMDB_PATH || path.join(process.cwd(), 'db');

/**
 * Delete database files to ensure a clean state
 */
export async function clearDatabase() {
  try {
    console.log('Cleaning up database before tests...');
    
    // Close and reset the store first
    await store.reset();
    
    // Then remove all database files to ensure a clean slate
    if (fs.existsSync(dbPath)) {
      console.log(`Deleting database files in ${dbPath}...`);
      
      // Get all files in the database directory
      const files = fs.readdirSync(dbPath);
      
      // Delete each database file
      for (const file of files) {
        const filePath = path.join(dbPath, file);
        fs.unlinkSync(filePath);
        console.log(`Deleted ${filePath}`);
      }
      
      console.log('Database files deleted');
    }
    
    // Make sure the directory exists
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(dbPath, { recursive: true });
    }
    
    // Reinitialize the database again after files are deleted
    await store.reset();
    
    console.log('Database has been reset and reinitialized');
  } catch (error) {
    console.error(`Error during database cleanup: ${error.message}`);
  }
}

// Run database cleanup before all tests
// We use a global setup in Jest configuration
export default async function globalSetup() {
  await clearDatabase();
} 