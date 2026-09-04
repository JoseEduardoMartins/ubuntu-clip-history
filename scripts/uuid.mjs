// Imprime o uuid da extensão (lido do metadata.json), sem newline.
// Usado por scripts de empacotamento — evita `require` num projeto ESM.
import { readFileSync } from 'node:fs';
process.stdout.write(JSON.parse(readFileSync('extension/metadata.json', 'utf8')).uuid);
