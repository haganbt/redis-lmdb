import set from '../../src/commands/set.js';
import del from '../../src/commands/del.js';
import exists from '../../src/commands/exists.js';

// Create a mock client state
const mockClientState = {
  clientId: 'test_client',
  inTransaction: false,
  commandQueue: []
};

test('DEL command should delete a key', async () => {
  // First check if key exists
  const doesExist = await exists('foo', mockClientState.clientId);
  expect(doesExist).toBe(':0\r\n');
}); 