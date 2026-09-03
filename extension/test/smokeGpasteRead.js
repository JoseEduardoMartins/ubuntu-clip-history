// Smoke READ-ONLY do gpaste.js contra o daemon vivo.
// Não muta o histórico. Rodar: gjs -m extension/test/smokeGpasteRead.js
import System from 'system';
import { GPaste } from '../gpaste.js';

try {
    const gp = new GPaste();
    const name = gp.getHistoryName();
    const hist = gp.getHistory();
    print(`história atual: "${name}"`);
    print(`itens: ${hist.length}`);
    if (hist.length > 0) {
        const first = hist[0];
        const ok = typeof first.uuid === 'string' && typeof first.content === 'string';
        print(`topo: uuid=${first.uuid.slice(0, 8)}… content(${first.content.length} chars)`);
        if (!ok) { print('FAIL - shape inesperado'); System.exit(1); }
    }
    gp.destroy();
    print('ok - leitura do GPaste funcionou');
} catch (e) {
    print(`FAIL - ${e}`);
    System.exit(1);
}
