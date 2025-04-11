import set from '../../src/commands/set.js';
import keys from '../../src/commands/keys.js';
import { store } from '../../src/store.js';

// Create a mock client state
const mockClientState = {
  clientId: 'test_client',
  inTransaction: false,
  commandQueue: []
};

test('KEYS command should list keys matching a pattern', async () => {
  // Set some test values and wait for them to complete
  await set(mockClientState, 'foo', 'bar');
  await set(mockClientState, 'foobar', 'baz');
  
  // Give a small delay to ensure all operations are complete
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Get keys matching pattern
  const matchedKeys = await keys(mockClientState, 'foo*');
  expect(matchedKeys).toBe('*2\r\n$3\r\nfoo\r\n$6\r\nfoobar\r\n');
}); 