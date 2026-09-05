// Lógica pura do auto-paste — sem gi, testável com gjs.
//
// A extensão cola injetando Ctrl+V no app que tinha o foco. Mas em terminais
// o colar é Ctrl+Shift+V (o Ctrl+V é reservado pra outras coisas), então lá o
// Ctrl+V não cola nada. Aqui só decidimos, pelo wm_class da janela focada, se
// ela é um terminal — o extension.js escolhe a combinação a injetar.

// wm_class (lowercased) dos terminais conhecidos. Não é exaustivo: um terminal
// fora da lista simplesmente recebe Ctrl+V (degradação segura — no pior caso o
// auto-paste não cola e o usuário aperta a própria tecla).
const TERMINALS = new Set([
    'gnome-terminal-server',
    'org.gnome.terminal',
    'konsole',
    'kitty',
    'alacritty',
    'org.wezfurlong.wezterm',
    'foot',
    'footclient',
    'org.gnome.ptyxis',
    'org.gnome.console',
    'kgx',
    'tilix',
    'terminator',
    'xterm',
    'com.raggesilver.blackbox',
]);

// -> true se `wmClass` é de um terminal conhecido (case-insensitive). Entrada
// ausente/inválida -> false (cai no Ctrl+V padrão).
export function isTerminal(wmClass) {
    if (typeof wmClass !== 'string' || wmClass === '')
        return false;
    return TERMINALS.has(wmClass.toLowerCase());
}
