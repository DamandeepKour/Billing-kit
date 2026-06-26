/** @type {import('jest').Config} */
const baseConfig = {
  preset: "ts-jest",
  testEnvironment: "node",
};

module.exports = {
  ...baseConfig,
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
  projects: [
    {
      ...baseConfig,
      displayName: "unit",
      testMatch: ["<rootDir>/tests/**/*.test.ts"],
      testPathIgnorePatterns: ["<rootDir>/tests/integration/"],
    },
    {
      ...baseConfig,
      displayName: "integration",
      testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
    },
  ],
};
