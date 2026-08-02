module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js', // Exclude entry point
    '!src/config/**',
    '!src/utils/database.js'
  ],
  verbose: true,
  setupFilesAfterEnv: ['./tests/setup.js']
};
