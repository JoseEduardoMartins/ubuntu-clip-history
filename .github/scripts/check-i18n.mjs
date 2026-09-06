// Valida que as traduções acompanham o código: cada string envolta em _() /
// this.gettext() na casca de UI (picker.js, prefs.js) precisa existir como msgid
// no template .pot E em cada tradução po/*.po (com msgstr não-vazio), e o po/.pot
// não pode ter msgids órfãos (não usados no código). Sai != 0 em qualquer erro.
//
// Roda no CI (ci.yml) e localmente: node .github/scripts/check-i18n.mjs
import { readFileSync, readdirSync } from 'node:fs';

const UI_SOURCES = ['extension/picker.js', 'extension/prefs.js'];
const PO_DIR = 'po';
const errors = [];

// --- Extrai os msgids usados no código (_('…') e .gettext('…')) -------------
function unescapeJs(s) {
    return s.replace(/\\(['"\\nt])/g, (_m, c) =>
        ({ n: '\n', t: '\t' }[c] ?? c));
}

function usedMsgids() {
    const ids = new Set();
    // _( '…' )  ou  .gettext( '…' ) — 1º grupo é a aspa, 2º o conteúdo.
    const patterns = [
        /(?<![\w$])_\(\s*(['"])((?:\\.|(?!\1).)*)\1/g,
        /\.gettext\(\s*(['"])((?:\\.|(?!\1).)*)\1/g,
    ];
    for (const src of UI_SOURCES) {
        const code = readFileSync(src, 'utf8');
        for (const re of patterns) {
            for (const m of code.matchAll(re))
                ids.add(unescapeJs(m[2]));
        }
    }
    return ids;
}

// --- Parser mínimo de .po/.pot ---------------------------------------------
function poUnquote(line) {
    // Pega o conteúdo entre as aspas e desfaz os escapes do formato PO.
    const inner = line.slice(line.indexOf('"') + 1, line.lastIndexOf('"'));
    return inner.replace(/\\(["\\nt])/g, (_m, c) => ({ n: '\n', t: '\t' }[c] ?? c));
}

// -> Map msgid -> msgstr (inclui o header de msgid vazio).
function parsePo(text) {
    const entries = new Map();
    let msgid = null;
    let msgstr = null;
    let target = null; // 'id' | 'str'
    const flush = () => {
        if (msgid !== null)
            entries.set(msgid, msgstr ?? '');
    };
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#'))
            continue;
        if (line.startsWith('msgid ')) {
            flush();
            msgid = poUnquote(line);
            msgstr = null;
            target = 'id';
        } else if (line.startsWith('msgstr ')) {
            msgstr = poUnquote(line);
            target = 'str';
        } else if (line.startsWith('"')) {
            const piece = poUnquote(line);
            if (target === 'id')
                msgid += piece;
            else
                msgstr += piece;
        }
    }
    flush();
    return entries;
}

function loadPo(name) {
    return parsePo(readFileSync(`${PO_DIR}/${name}`, 'utf8'));
}

// --- Checagens --------------------------------------------------------------
const used = usedMsgids();
if (used.size === 0)
    errors.push('nenhum msgid _() encontrado no código — o extrator quebrou?');

const files = readdirSync(PO_DIR);
const potName = files.find(f => f.endsWith('.pot'));
const poNames = files.filter(f => f.endsWith('.po'));

if (!potName)
    errors.push('nenhum template .pot em po/');
if (poNames.length === 0)
    errors.push('nenhuma tradução .po em po/');

// .pot: precisa conter exatamente os msgids usados (sem faltar, sem órfão).
if (potName) {
    const pot = new Set([...loadPo(potName).keys()].filter(k => k));
    for (const id of used)
        if (!pot.has(id))
            errors.push(`.pot (${potName}): falta o msgid ${JSON.stringify(id)}`);
    for (const id of pot)
        if (!used.has(id))
            errors.push(`.pot (${potName}): msgid órfão (não usado no código) ${JSON.stringify(id)}`);
}

// Cada .po: precisa cobrir todos os msgids usados, com msgstr não-vazio.
for (const name of poNames) {
    const po = loadPo(name);
    for (const id of used) {
        if (!po.has(id)) {
            errors.push(`${name}: falta o msgid ${JSON.stringify(id)}`);
        } else if (!po.get(id).trim()) {
            errors.push(`${name}: msgstr vazio (não traduzido) para ${JSON.stringify(id)}`);
        }
    }
    for (const id of po.keys())
        if (id && !used.has(id))
            errors.push(`${name}: msgid órfão (não usado no código) ${JSON.stringify(id)}`);
}

if (errors.length) {
    console.error('i18n fora de sincronia:');
    for (const e of errors)
        console.error(`  - ${e}`);
    process.exit(1);
}
console.log(`i18n ok (${used.size} strings, ${poNames.length} tradução(ões))`);
