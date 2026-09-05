// Testes de text.js. Rodar: gjs -m extension/test/testText.js
import { eq, check, report } from './assert.js';
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

// --- Corte não parte caractere multi-byte (surrogate pair) ---
// Um emoji ('😀') ocupa 2 unidades UTF-16. O corte por unidade partia o par
// no limite, produzindo um surrogate solitário (renderiza como '�').
// Surrogate solitário = alto sem baixo em seguida, ou baixo sem alto antes.
// (Um par válido — emoji inteiro — NÃO conta.)
const hasLoneSurrogate = s =>
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(s) ||
    /(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
// 499 ASCII + 1 emoji = 500 code points (501 unidades UTF-16): cabe inteiro.
eq('emoji no limite fica inteiro',
    preview('x'.repeat(499) + '😀').endsWith('😀'), true);
check('emoji no limite não vira surrogate solto',
    !hasLoneSurrogate(preview('x'.repeat(499) + '😀')));
// 500 ASCII + 1 emoji = 501 code points: o emoji é descartado, não partido.
eq('emoji que estoura é descartado inteiro',
    preview('x'.repeat(500) + '😀'), 'x'.repeat(500));
check('nenhum surrogate solto ao estourar',
    !hasLoneSurrogate(preview('x'.repeat(500) + '😀')));
// 300 emojis = 300 code points (600 unidades UTF-16): abaixo do limite, intacto.
eq('emojis abaixo do limite ficam intactos',
    Array.from(preview('😀'.repeat(300))).length, 300);

report();
