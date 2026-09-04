// Mini harness compartilhado pelos testes de lógica pura (gjs -m).
//
// Cada teste roda num processo gjs próprio (ver run.sh), então o contador de
// falhas abaixo é por-processo — sem vazamento entre arquivos. Uso:
//
//   import { eq, deepEq, check, throws, section, report } from './assert.js';
//   eq('soma', 1 + 1, 2);
//   report();               // imprime o resumo e sai com status != 0 se falhou
//
// Para testes assíncronos, use `await` no corpo e chame `report()` no fim.

import System from 'system';

let failures = 0;
let total = 0;

// Assert base: registra ok/FAIL e conta.
export function check(name, cond) {
    total++;
    print(cond ? `ok   - ${name}` : `FAIL - ${name}`);
    if (!cond)
        failures++;
}

// Igualdade estrita (===) com valores serializados na mensagem.
export function eq(name, got, want) {
    check(`${name} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`,
        got === want);
}

// Igualdade estrutural por JSON (ordem de chaves importa, como no código antigo).
export function deepEq(name, got, want) {
    check(`${name} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`,
        JSON.stringify(got) === JSON.stringify(want));
}

// Passa se `fn()` lançar. `fn` pode ser síncrona; para async use `rejects`.
export function throws(name, fn) {
    let threw = false;
    try {
        fn();
    } catch {
        threw = true;
    }
    check(`${name} (esperava lançar)`, threw);
}

// Passa se a Promise de `fn()` rejeitar.
export async function rejects(name, fn) {
    let threw = false;
    try {
        await fn();
    } catch {
        threw = true;
    }
    check(`${name} (esperava rejeitar)`, threw);
}

// Cabeçalho visual opcional para agrupar asserts na saída.
export function section(title) {
    print(`--- ${title} ---`);
}

// Imprime o resumo e encerra o processo. Chame no fim de cada arquivo.
export function report() {
    if (failures > 0) {
        print(`\n${failures}/${total} teste(s) falharam`);
        System.exit(1);
    } else {
        print(`\ntodos os ${total} testes passaram`);
    }
}
