import exec from '../../src/commands/exec.js';
import multi from '../../src/commands/multi.js';
import set from '../../src/commands/set.js';
import get from '../../src/commands/get.js';
import { store } from '../../src/store.js';
import { beforeAll, afterAll, describe, test, expect } from '@jest/globals';

// Reset database before all tests
beforeAll(async () => {
  await store.reset();
});

// Reset database after all tests
afterAll(async () => {
  await store.reset();
});

describe('EXEC command', () => {
  test('EXEC should return error if not in a transaction', async () => {
    const clientState = {
      clientId: 'test_client',
      inTransaction: false,
      commandQueue: []
    };
    
    const result = await exec(clientState);
    expect(result).toContain('ERR EXEC without MULTI');
  });
  
  test('EXEC should execute commands in queue if in a transaction', async () => {
    const clientState = {
      clientId: 'test_client',
      inTransaction: false,
      commandQueue: []
    };
    
    // Start transaction
    await multi(clientState);
    expect(clientState.inTransaction).toBe(true);
    
    // Queue a SET command
    await set(clientState, 'key', 'value');
    expect(clientState.commandQueue.length).toBe(1);
    
    // Execute the transaction
    const result = await exec(clientState);
    
    // Check that the transaction was executed
    expect(clientState.inTransaction).toBe(false);
    expect(clientState.commandQueue.length).toBe(0);
    
    // Verify the key was set
    const value = await get({ clientId: 'test_client' }, 'key');
    expect(value).toBe('$5\r\nvalue\r\n');
  });
}); 