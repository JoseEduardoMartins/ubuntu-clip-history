# Arquitetura

Documento vivo do estado **atual** do código: mapa de módulos, fluxo de dados,
decisões de design (o "porquê") e restrições conhecidas. Para a visão de produto
e instalação, veja o [`README.md`](../README.md).

## Visão geral

Clip History é uma **extensão do GNOME Shell** (GJS/ESM, Shell 46/47/48) que
expõe um histórico de área de transferência estilo `Win+V`. Ela **não guarda o
histórico**: usa o **GPaste** (daemon já existente) como backend via D-Bus. A
extensão é a UI e a orquestração — abre um popup com `Super+V` ancorado no caret
do campo focado, lista o histórico (texto **e imagens**), e ao escolher um item
recopia para o clipboard e injeta `Ctrl+V` no app anterior.

Ser uma extensão (e não um app GTK) é a decisão central: no Wayland só o
processo do Shell pode posicionar `actors` na tela e injetar teclas — um
toplevel GTK não controla a própria posição.

Os favoritos ("pinos") são o único estado próprio da extensão: um JSON local,
durável, independente do limite de 100 itens do GPaste.

## Mapa de módulos (`extension/`)

O código é dividido entre **lógica pura** (sem `gi://`, testável com `gjs`) e
**camada acoplada ao Shell** (`St`/`Clutter`/`Gio`/`Meta`/`Shell`). A separação
existe para tornar testável o que carrega a complexidade real.

| Arquivo | Papel | Acoplamento |
|---|---|---|
| `extension.js` | Ciclo de vida (`enable`/`disable`), atalho, captura do caret, orquestração dos handlers, auto-paste via device virtual | Shell (Meta, Shell, Clutter, Main) |
| `gpaste.js` | Wrapper fino do D-Bus do GPaste (**chamadas assíncronas**): `getHistory` (barato: uuid+content), `getMeta` (lazy por uuid: kind/imagePath, cacheado), `add`, `select`, `delete`, `empty`, sinal `Update` | Gio/GLib |
| `picker.js` | UI do popup (`St`): header, busca, lista rolável (texto + **miniatura de imagem** via `TextureCache`), footer; navegação por teclado; emite sinais | St/Clutter/GObject/Gio |
| `pickerLogic.js` | **Puro:** `filterEntries`, `clampSelected`, `nextSelected`, `keyAction` | nenhum |
| `pins.js` | **Puro:** `isPinned`/`addPin`/`removePin`/`mergeEntries` (propaga `kind`/`imagePath`); **+ persistência** em `~/.local/share/clip-history/pins.json` via Gio | misto (lógica pura + Gio) |
| `position.js` | **Puro:** `computePosition`, `validCaret`, `pickMonitor` — onde o popup aparece dado caret + work area (multi-monitor) | nenhum |
| `text.js` | **Puro:** `preview` — colapsa/apara texto para o label da linha | nenhum |
| `prefs.js` | Tela de preferências (só o atalho), Adw/Gtk | Adw/Gtk |
| `metadata.json` | UUID, `shell-version`, `settings-schema` | — |
| `schemas/…gschema.xml` | Chave `toggle-clip-history` (default `<Super>v`) | — |
| `stylesheet.css` | Estilo do popup | — |

`extension.js` é o único que conhece todos os outros; a lógica pura não conhece
ninguém (nem o Shell, nem `extension.js`).

## Fluxo de dados

**Abrir** (`Super+V` → `_toggle` → `_open`):
1. **Captura o caret ANTES de tudo** (`_captureCaret`): assim que o popup pega
   o foco, o input method passa a apontar pro nosso `St.Entry` e o caret do app
   original se perde. A fonte é `Main.inputMethod._cursorRect` (mesma âncora do
   popup de candidatos do IBus, já em coords de stage) — API privada, acesso
   defensivo: qualquer ausência/erro cai em `null`.
2. Cria o `Picker`, conecta os sinais e dá foco (`pushModal` + `grabFocus`).
3. Lê o histórico **de forma assíncrona** (`_loadEntries`, não bloqueia o
   compositor) via `gpaste.getHistory()` (barato — só uuid+content) e funde com
   os pinos (`mergeEntries`) → `picker.setEntries(..., { resolveMeta })`. As
   linhas nascem como texto e cada uma vira imagem quando `getMeta(uuid)`
   resolve (lazy por linha — evita a rajada de chamadas D-Bus no arranque).
4. Só no primeiro load, `_position` ancora o popup: `pickMonitor` escolhe o
   monitor que contém o caret e `computePosition` decide x,y (abaixo do caret,
   ou acima se não couber; **sem caret válido → canto inferior direito**).

**Escolher → colar** (`chosen`):
1. `gpaste.select(uuid)` recopia o elemento existente (texto **ou imagem**) pro
   clipboard, subindo ao topo (dedup do GPaste). Sem uuid (pino de texto que já
   saiu do histórico), faz `gpaste.add(content)` por texto.
2. Fecha o popup (`popModal` + destroy) → o Mutter devolve o foco ao app anterior.
3. Após ~90 ms, injeta `Ctrl+V` por um **device virtual do Clutter**
   (`seat.create_virtual_device`) — o atraso garante que o foco já voltou.

**Pino / excluir / limpar** (`pin-toggled` / `deleted` / `clear-all`):
- Pino: alterna via `addPin`/`removePin`, persiste com `savePins`, refresca.
- Excluir: `gpaste.delete(uuid)` (se houver uuid) e remove do pino se estava
  fixado.
- Limpar: `gpaste.empty()` + zera os pinos.

**Refresh ao vivo:** `gpaste.connectUpdate(...)` dispara em toda mutação do
histórico; se o popup está aberto, `extension.js` recarrega as entradas.

**Teclado** (no `picker.js`): `keyAction` traduz tecla+modificador numa ação
abstrata (`dismiss`/`choose-selected`/`choose-index`/`move`/`delete-selected`/
`pin-selected`/`passthrough`), e o `picker` executa. Excluir exige `Ctrl+Delete`
(o `Delete` sozinho cai em `passthrough` para editar a busca, já que o foco fica
no `St.Entry`). Navegar (`move`) só alterna a classe `selected` na linha e rola
para a vista — não reconstrói a lista. O mapa de constantes do Clutter fica no
`KEY_MAP` do `picker.js` — é o contrato com a lógica pura.

## Testes

A lógica pura é testada com o interpretador `gjs`; o runner
`extension/test/run.sh` roda os suites `testPins`, `testPosition`, `testText`,
`testPickerLogic` e `testGpaste`. Todos compartilham o mini-harness
`extension/test/assert.js` (`eq`/`deepEq`/`check`/`report`), que conta os asserts
e sai com status != 0 se algum falhar.

`gpaste.js` é testável apesar do D-Bus: o construtor aceita `{ call }`, uma
função que substitui `_proxy.call(...)`. `testGpaste.js` injeta um duble que
devolve variantes falsas (`{ deepUnpack }`) e registra as chamadas, cobrindo o
cache do `getMeta`, a poda do `getHistory`, a normalização de `kind`, a
degradação sem `GetElementKind` e o roteamento de `add`/`select`/`delete`/`empty`
— sem sessão nem daemon. Sem `{ call }`, o construtor sobe o proxy real
(produção, comportamento inalterado).

O `smokeGpasteRead.js` é um smoke read-only contra o daemon vivo — fica **fora**
do runner/CI (precisa do session bus).

A camada acoplada (`extension.js`, `picker.js`, `prefs.js`) não tem teste
unitário por depender de uma sessão GNOME viva; a estratégia é extrair a lógica
para módulos puros (como `pickerLogic.js`) — ou injetar as dependências, como no
`gpaste.js` — e validar a casca por syntax-check no CI + teste manual (`Super+V`).

## CI/CD

- **`.github/workflows/ci.yml`** (em Pull Request): instala as deps, roda ESLint
  (`npm run lint`, config flat em `eslint.config.js` com os globais do GJS), a
  suíte (`npm test`), valida o schema (`glib-compile-schemas --strict`), o
  `metadata.json` (`.github/scripts/check-metadata.mjs`) e a sintaxe de todos os
  `.js`. As deps Node são só de dev; nada disso vai pro pacote da extensão.
- **`.github/workflows/release.yml`** (push na `main`): **semantic-release**
  analisa os commits (Conventional Commits), calcula a próxima versão semver,
  gera o `CHANGELOG.md`, empacota `extension/` num zip (`scripts/build-zip.sh`)
  e publica o GitHub Release. Sem tag manual.

O `metadata.json` do GNOME exige `version` inteiro; `scripts/release-prepare.mjs`
incrementa esse inteiro em +1 a cada release e grava o semver em `version-name`.
O `@semantic-release/git` commita `CHANGELOG.md` + `metadata.json` de volta na
`main` (com `[skip ci]`, pra não reentrar no workflow).

Commits e hooks: **Husky** (`.husky/`) instala `pre-commit` (ESLint) e
`commit-msg` (**commitlint**, `commitlint.config.js`); os testes ficam no CI do
PR. Config do release em `.releaserc.json`.

## Instalação e empacotamento

`install.sh` copia `extension/` para
`~/.local/share/gnome-shell/extensions/<uuid>/`, compila o gschema, libera o
`Super+V` do `toggle-message-tray` e habilita a extensão. No **Wayland**, a
extensão nova só carrega após **logout/login**.

## Restrições e pontos em aberto

- **Caret via API privada:** a âncora do popup vem de `Main.inputMethod._cursorRect`
  (não é API pública/estável do Shell). O acesso é defensivo — se a propriedade
  sumir ou mudar entre versões, `_captureCaret` cai em `null` e o popup volta ao
  canto inferior direito. Independe de AT-SPI.
- **Só texto é fixável** (`isPinnable`): o pino é um store de texto (dedup por
  `content`); `kind === 'image'` e `kind === 'password'` não expõem o botão `★`.
  Imagens vivem só enquanto estão no histórico do GPaste (cap de 100).
- **Senhas mascaradas:** itens que o GPaste marca como `Password` são exibidos
  com cadeado + máscara (`_passwordContent`), nunca o valor — que só é recopiado
  ao escolher. Como o `kind` é resolvido lazy (por linha), há uma janela mínima
  antes do upgrade; depende ainda do GPaste marcar o item como senha (apps que
  copiam a senha como texto comum não são detectados).
- **GPaste é obrigatório:** sem o daemon, `getHistory` falha e a lista fica
  vazia — o `enable()` sobrevive de propósito (não vai a estado ERROR). Um GPaste
  que não exponha `GetElementKind`/`GetRawElement` degrada tudo para texto.
- **Busca com debounce:** o campo de busca refiltra ~120ms depois da última
  tecla (não a cada caractere), evitando reconstruir a lista inteira na digitação.
- **Texto, imagens e senhas**, últimos 100 itens (limite do GPaste); pinos (de
  texto) escapam do limite.
