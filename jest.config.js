/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/index.ts",
    "!src/modules.ts",
    "!src/**/index.ts",
    "!src/payment/gateways/**",
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 50,
      lines: 80,
      statements: 80,
    },
  },
};
