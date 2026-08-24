import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  /*
   * Build output, which is generated JavaScript and not ours to lint.
   *
   * `.vercel/**` and `.output/**` arrived with the Nitro target: the Vercel
   * preset writes `.vercel/output`, which contains the whole client bundle plus a
   * verbatim copy of everything in `public/` — including the two Draco decoders,
   * which are minified Emscripten output and on their own account for most of the
   * errors a lint run over that directory reports. Ignoring them here rather than
   * as another `--ignore-pattern` flag keeps every build directory in one list.
   */
  globalIgnores([
    '.next/**',
    '.vercel/**',
    '.output/**',
    '.nitro/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
