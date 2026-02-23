/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: {
        jsx: "react-jsx",
        esModuleInterop: true,
        module: "CommonJS",
        moduleResolution: "node",
        strict: true,
      },
    }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  collectCoverageFrom: [
    "src/constants/reportPresets.ts",
    "src/types/reportTypes.ts",
    "src/app/api/report-ai/route.ts",
  ],
};

module.exports = config;
