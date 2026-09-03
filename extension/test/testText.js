// Testes de text.js. Rodar: gjs -m extension/test/testText.js
import System from 'system';
import { preview } from '../text.js';

let failures = 0;
function eq(name, got, want) {
    const ok = got === want;
    print(ok ? `ok   - ${name}` : `FAIL - ${name} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`);
    if (!ok) failures++;
}

eq('colapsa espaços internos', preview('a   b\t c'), 'a b c');
eq('colapsa quebras de linha', preview('linha1\nlinha2\n\nlinha3'), 'linha1 linha2 linha3');
eq('apara pontas', preview('   oi   '), 'oi');
eq('vazio vira vazio', preview(''), '');
eq('corta em 500 chars', preview('x'.repeat(600)).length, 500);
eq('mantém curto igual', preview('hello world'), 'hello world');

if (failures > 0) { print(`\n${failures} falhou(ram)`); System.exit(1); }
else print('\ntodos os testes passaram');
