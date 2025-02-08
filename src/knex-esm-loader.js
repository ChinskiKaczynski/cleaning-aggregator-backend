// knex-esm-loader.js
import { createRequire } from 'module';
export const resolve = (specifier, context, defaultResolve) => {
  return specifier === 'knex' 
    ? { url: 'knex', format: 'commonjs' } 
    : defaultResolve(specifier, context, defaultResolve);
};
