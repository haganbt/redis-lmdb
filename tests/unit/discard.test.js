import discard from '../../src/commands/discard.js';

// Mock client state
const mockClientState = {
  inTransaction: false,
  commandQueue: []
};

beforeEach(() => {
  // Reset mock state before each test
  mockClientState.inTransaction = false;
  mockClientState.commandQueue = ['COMMAND1', 'COMMAND2'];
});

test('DISCARD should clear transaction state and return OK', () => {
  // Set up transaction state
  mockClientState.inTransaction = true;
  
  const response = discard(mockClientState);
  
  // Should clear transaction state
  expect(mockClientState.inTransaction).toBe(false);
  expect(mockClientState.commandQueue).toEqual([]);
  
  // Should return OK
  expect(response).toBe('+OK\r\n');
});

test('DISCARD should return error if not in a transaction', () => {
  // Not in transaction
  mockClientState.inTransaction = false;
  
  const response = discard(mockClientState);
  
  // Should return error
  expect(response).toBe('-ERR DISCARD without MULTI\r\n');
}); 