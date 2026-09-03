// Valida extension/metadata.json: JSON válido, campos obrigatórios do GNOME
// presentes e coerentes com o schema. Sai com código != 0 em qualquer erro.
import { readFileSync } from 'node:fs';

const errors = [];
const path = 'extension/metadata.json';

let meta;
try {
    meta = JSON.parse(readFileSync(path, 'utf8'));
} catch (e) {
    console.error(`metadata.json não é JSON válido: ${e.message}`);
    process.exit(1);
}

// Campos exigidos pelo GNOME Shell.
for (const key of ['uuid', 'name', 'description', 'shell-version']) {
    if (meta[key] === undefined || meta[key] === null || meta[key] === '')
        errors.push(`campo obrigatório ausente: "${key}"`);
}

if (meta.uuid && !/^[^@]+@[^@]+$/.test(meta.uuid))
    errors.push(`uuid deve ter o formato nome@dominio: "${meta.uuid}"`);

if (meta['shell-version'] !== undefined) {
    if (!Array.isArray(meta['shell-version']) || meta['shell-version'].length === 0)
        errors.push('shell-version deve ser um array não-vazio');
}

// Se declara settings-schema, precisa bater com o id do gschema no repo.
if (meta['settings-schema']) {
    const gschema = readFileSync(
        'extension/schemas/org.gnome.shell.extensions.clip-history.gschema.xml', 'utf8');
    if (!gschema.includes(`id="${meta['settings-schema']}"`))
        errors.push(`settings-schema "${meta['settings-schema']}" não encontrado no gschema.xml`);
}

if (errors.length) {
    console.error('metadata.json inválido:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
}
console.log('metadata.json ok');
