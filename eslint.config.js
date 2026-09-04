// Lint da extensão (GJS/ESM). O objetivo é pegar erros reais — variáveis não
// declaradas (`no-undef`) e não usadas — que o `node --check` (só sintaxe) não
// vê. Ex.: um acesso a uma API do Shell com o nome errado.
import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['extension/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // Builtins da linguagem (Promise, Map, Set, JSON, …).
                ...globals.es2021,
                // Globais do ambiente GJS/GNOME Shell não cobertos acima.
                console: 'readonly',
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
                log: 'readonly',
                logError: 'readonly',
                print: 'readonly',
                global: 'readonly',
                globalThis: 'readonly',
            },
        },
        rules: {
            // Args/vars/erros-capturados com prefixo _ são intencionalmente
            // ignorados (ex.: os `_a`, `_p` de callbacks de sinal do GObject, ou
            // `catch (_e)`).
            'no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],
        },
    },
    {
        ignores: ['node_modules/', 'extension/schemas/'],
    },
];
