// Testes de text.js. Rodar: gjs -m extension/test/testText.js
import { eq, report } from './assert.js';
import { preview } from '../text.js';

eq('colapsa espaços internos', preview('a   b\t c'), 'a b c');
eq('colapsa quebras de linha', preview('linha1\nlinha2\n\nlinha3'), 'linha1 linha2 linha3');
eq('apara pontas', preview('   oi   '), 'oi');
eq('vazio vira vazio', preview(''), '');
eq('só espaços vira vazio', preview('  \n\t  '), '');
eq('mantém curto igual', preview('hello world'), 'hello world');

// --- Limite de 500 (corte) ---
eq('exatamente 500 não corta', preview('x'.repeat(500)).length, 500);
eq('501 corta pra 500', preview('x'.repeat(501)).length, 500);
eq('corta em 500 chars', preview('x'.repeat(600)).length, 500);
// O colapso de espaços acontece ANTES do corte: 600 espaços viram '' (trim).
eq('espaços não contam pro limite', preview(' '.repeat(600)), '');

// --- Coerção de não-string (String() defensivo) ---
eq('número é coagido', preview(42), '42');
eq('null é coagido', preview(null), 'null');
eq('undefined é coagido', preview(undefined), 'undefined');

report();
