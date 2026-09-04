// Ajusta extension/metadata.json para um release do semantic-release.
//
// O GNOME exige `version` INTEIRO e monotônico (é o que decide "há atualização").
// O semantic-release trabalha com semver (X.Y.Z). Então:
//   - version       -> inteiro atual + 1 (monotônico, compatível com o GNOME)
//   - version-name  -> o semver do release (string, o que humanos veem)
//
// O @semantic-release/git commita o metadata.json alterado de volta na main,
// então o incremento persiste entre releases.
//
// Uso: node scripts/release-prepare.mjs <semver>
import { readFileSync, writeFileSync } from 'node:fs';

const versionName = process.argv[2];
if (!versionName) {
    console.error('erro: informe o semver. Uso: release-prepare.mjs <semver>');
    process.exit(1);
}

const path = 'extension/metadata.json';
const meta = JSON.parse(readFileSync(path, 'utf8'));

meta.version = (Number.isInteger(meta.version) ? meta.version : 0) + 1;
meta['version-name'] = versionName;

writeFileSync(path, `${JSON.stringify(meta, null, 2)}\n`);
console.log(`metadata.json: version=${meta.version}, version-name=${meta['version-name']}`);
