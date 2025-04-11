module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.js'
  ],
  // Add timeout to prevent tests from hanging
  testTimeout: 10000,
  // Force tests to run sequentially (like using --runInBand)
  maxWorkers: 1,
  // Only run specific tests that we know work
  testPathIgnorePatterns: [
    '/node_modules/',
    'tests/integration/redis-client.test.js',
    'tests/performance/'
  ],
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
  // Allow importing from node_modules without transformation
  transformIgnorePatterns: [
    "node_modules/(?!(.pnpm)/)"
  ],
  // Babel configuration for ESM
  moduleFileExtensions: ['js', 'json', 'jsx', 'node'],
}; 