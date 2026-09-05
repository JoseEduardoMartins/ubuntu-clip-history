// Testes de paste.js. Rodar: gjs -m extension/test/testPaste.js
import { check, section, report } from './assert.js';
import { isTerminal } from '../paste.js';

// --- isTerminal ----------------------------------------------------------
// Detecta se a janela focada (por wm_class) é um terminal, onde o colar é
// Ctrl+Shift+V e não Ctrl+V.
section('isTerminal');

// Terminais conhecidos (o wm_class real de cada um), case-insensitive.
{
    const terms = [
        'gnome-terminal-server',
        'org.gnome.Terminal',
        'konsole',
        'kitty',
        'Alacritty',
        'org.wezfurlong.wezterm',
        'foot',
        'footclient',
        'org.gnome.Ptyxis',
        'org.gnome.Console',
        'kgx',
        'Tilix',
        'terminator',
        'xterm',
        'com.raggesilver.BlackBox',
    ];
    for (const t of terms)
        check(`terminal: ${t}`, isTerminal(t) === true);
}

// Casamento é case-insensitive (o wm_class pode variar em caixa).
{
    check('KONSOLE (maiúsculo)', isTerminal('KONSOLE') === true);
    check('AlAcRiTtY (misto)', isTerminal('AlAcRiTtY') === true);
}

// Não-terminais: não devem colar com Ctrl+Shift+V.
{
    const others = [
        'firefox',
        'org.gnome.Nautilus',
        'code',
        'Gedit',
        'org.gnome.TextEditor',
        'libreoffice-writer',
        'Slack',
    ];
    for (const o of others)
        check(`não-terminal: ${o}`, isTerminal(o) === false);
}

// Entrada ausente/inválida -> false (defensivo: cai no Ctrl+V padrão).
{
    check('null -> false', isTerminal(null) === false);
    check('undefined -> false', isTerminal(undefined) === false);
    check('string vazia -> false', isTerminal('') === false);
    check('número -> false', isTerminal(42) === false);
}

report();
