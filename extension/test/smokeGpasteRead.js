// Smoke READ-ONLY do gpaste.js contra o daemon vivo.
// Não muta o histórico. Rodar: gjs -m extension/test/smokeGpasteRead.js
import GLib from 'gi://GLib';
import System from 'system';
import { GPaste } from '../gpaste.js';

// O gpaste.js agora é assíncrono (call/call_finish), então precisamos de um
// main loop rodando pros callbacks do D-Bus dispararem.
const loop = GLib.MainLoop.new(null, false);

async function main() {
    try {
        const gp = new GPaste();
        const name = await gp.getHistoryName();
        const hist = await gp.getHistory();
        print(`história atual: "${name}"`);
        print(`itens: ${hist.length}`);
        if (hist.length > 0) {
            const first = hist[0];
            const ok = typeof first.uuid === 'string' && typeof first.content === 'string';
            print(`topo: uuid=${first.uuid.slice(0, 8)}… content(${first.content.length} chars)`);
            if (!ok) { print('FAIL - shape inesperado'); System.exit(1); }
        }
        // getHistory agora é barato (só uuid+content); kind/imagePath vêm do
        // getMeta(uuid), resolvido por linha. Resolve todos aqui só pro smoke.
        const metas = await Promise.all(hist.map(e => gp.getMeta(e.uuid)));
        const images = hist
            .map((e, i) => ({ ...e, ...metas[i] }))
            .filter(e => e.kind === 'image');
        print(`imagens: ${images.length}`);
        for (const img of images)
            print(`  img uuid=${img.uuid.slice(0, 8)}… path=${img.imagePath}`);
        gp.destroy();
        print('ok - leitura do GPaste funcionou');
    } catch (e) {
        print(`FAIL - ${e}`);
        System.exit(1);
    } finally {
        loop.quit();
    }
}

main();
loop.run();
