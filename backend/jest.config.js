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
  // 30 detik, bukan default 5 detik: `npm run test:staging` menembak DB
  // staging remote (Aiven). Handshake TLS pertama saja terukur ~4,1 detik,
  // dan tiap query ~70 ms, sehingga test yang sebelumnya hijau bisa timeout
  // hanya karena jarak jaringan — bukan karena logika aplikasi rusak.
  testTimeout: 30000,
  setupFilesAfterEnv: ['./tests/setup.js']
};
