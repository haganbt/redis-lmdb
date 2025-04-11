import set from '../../src/commands/set.js';
import get from '../../src/commands/get.js';
import { store } from '../../src/store.js';
import { beforeAll, afterAll, describe, test, expect } from '@jest/globals';

// Create a mock client state
const mockClientState = {
  clientId: 'test_client',
  inTransaction: false,
  commandQueue: []
};

beforeAll(async () => {
  // Reset the database
  await store.reset();
});

afterAll(async () => {
  // Reset the database
  await store.reset();
});

test('GET command should retrieve a value', async () => {
  // Set a value first
  await set(mockClientState, 'foo', 'bar');
  
  // Get the value (should be in RESP bulk string format)
  const value = await get(mockClientState, 'foo');
  expect(value).toBe('$3\r\nbar\r\n');
}); 