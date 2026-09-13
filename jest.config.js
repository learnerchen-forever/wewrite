/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/jest-setup.js'],
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts',
    // esbuild bundles src/resources/icons/*.svg as text; unit tests only need
    // the import to resolve (see tests/__mocks__/svg.ts).
    '\\.svg$': '<rootDir>/tests/__mocks__/svg.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      // Transpile only: the base tsconfig sets `isolatedModules`, so ts-jest
      // skips type checking. Types are covered separately by
      // `npm run typecheck:tests`, which is faster than checking in every run.
      tsconfig: 'tsconfig.json',
    }],
  },
};
