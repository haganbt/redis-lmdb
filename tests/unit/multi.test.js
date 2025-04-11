import multi from '../../src/commands/multi.js';

// Mock client state
const mockClientState = {
  inTransaction: false,
  commandQueue: []
};

beforeEach(() => {
  // Reset mock state before each test
  mockClientState.inTransaction = false;
  mockClientState.commandQueue = [];
});

test('MULTI should set transaction flag and return OK', () => {
  const response = multi(mockClientState);
  
  // Should set transaction flag
  expect(mockClientState.inTransaction).toBe(true);
  
  // Should return OK
  expect(response).toBe('+OK\r\n');
});

test('MULTI should return error if already in transaction', () => {
  // Already in transaction
  mockClientState.inTransaction = true;
  
  const response = multi(mockClientState);
  
  // Should return error
  expect(response).toBe('-ERR MULTI calls can not be nested\r\n');
}); 