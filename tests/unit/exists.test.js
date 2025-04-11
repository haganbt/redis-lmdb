import set from '../../src/commands/set.js';
import exists from '../../src/commands/exists.js';
import { store } from '../../src/store.js';
import { beforeAll, afterAll, describe, test, expect } from '@jest/globals';

// Create a mock client state
const mockClientState = {
  clientId: 'test_client',
  inTransaction: false,
  commandQueue: []
};

// Reset database before running tests
beforeAll(async () => {
  await store.reset();
});

// Reset database after running tests
afterAll(async () => {
  await store.reset();
});

test('EXISTS command should check if a key exists', async () => {
  // Set a value first
  await set(mockClientState, 'foo', 'bar');
  
  // Check if the key exists
  const doesExist = await exists(mockClientState, 'foo');
  expect(doesExist).toBe(':1\r\n');
}); 