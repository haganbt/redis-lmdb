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

test('SET command should store a value', async () => {
  // Set a value
  const response = await set(mockClientState, 'foo', 'bar');
  expect(response).toBe('+OK\r\n');
  
  // Get the value (should be in RESP bulk string format)
  const value = await get(mockClientState, 'foo');
  expect(value).toBe('$3\r\nbar\r\n');
}); 