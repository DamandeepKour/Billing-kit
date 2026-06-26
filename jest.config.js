/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/index.ts",
    "!src/**/index.ts",
    "!src/payment/gateways/**",
  ],
};
