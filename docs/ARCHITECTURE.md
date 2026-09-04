# Arquitetura

Documento vivo do estado **atual** do código. Para o histórico de decisões de
design (o "porquê" original, incluindo caminhos que não foram seguidos), veja o
spec datado em
[`docs/superpowers/specs/2026-09-01-clip-history-gnome-extension-design.md`](superpowers/specs/2026-09-01-clip-history-gnome-extension-design.md).

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
| `gpaste.js` | Wrapper fino do D-Bus do GPaste (**chamadas assíncronas**): `getHistory` (enriquecido com `kind`/`imagePath`), `add`, `select`, `delete`, `empty`, sinal `Update` | Gio/GLib |
| `picker.js` | UI do popup (`St`): header, busca, lista rolável (texto + **miniatura de imagem** via `TextureCache`), footer; navegação por teclado; emite sinais | St/Clutter/GObject/Gio |
| `pickerLogic.js` | **Puro:** `filterEntries`, `clampSelected`, `nextSelected`, `keyAction` | nenhum |
| `pins.js` | **Puro:** `isPinned`/`addPin`/`removePin`/`mergeEntries` (propaga `kind`/`imagePath`); **+ persistência** JSON via Gio | misto (lógica pura + Gio) |
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
   compositor) via `gpaste.getHistory()` e funde com os pinos (`mergeEntries`)
   → `picker.setEntries(...)`.
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
`pin-selected`/`passthrough`), e o `picker` executa. O mapa de constantes do
Clutter fica no `KEY_MAP` do `picker.js` — é o contrato com a lógica pura.

## Testes

A lógica pura é testada com o interpretador `gjs`; o runner
`extension/test/run.sh` roda os quatro suites (`testPins`, `testPosition`,
`testText`, `testPickerLogic`). O `smokeGpasteRead.js` é um smoke read-only
contra o daemon vivo — fica **fora** do runner/CI (precisa do session bus).

A camada acoplada (`extension.js`, `picker.js`, `prefs.js`) não tem teste
unitário por depender de uma sessão GNOME viva; a estratégia é extrair a lógica
para módulos puros (como `pickerLogic.js`) e validar a casca por syntax-check no
CI + teste manual (`Super+V`).

## CI/CD

- **`.github/workflows/ci.yml`** (push na `main` + PR): `run.sh`, valida o
  schema (`glib-compile-schemas --strict`), o `metadata.json`
  (`.github/scripts/check-metadata.mjs`) e a sintaxe de todos os `.js`.
- **`.github/workflows/release.yml`** (tag `v*`): reexecuta as checagens,
  empacota `extension/` num zip (schema compilado, sem `test/`) e publica um
  GitHub Release com o anexo.

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
- **Imagens não são fixáveis:** o pino é um store de texto (dedup por `content`);
  itens `kind === 'image'` não expõem o botão `★`. Imagens vivem só enquanto
  estão no histórico do GPaste (sujeitas ao cap de 100).
- **GPaste é obrigatório:** sem o daemon, `getHistory` falha e a lista fica
  vazia — o `enable()` sobrevive de propósito (não vai a estado ERROR). Um GPaste
  que não exponha `GetElementKind`/`GetRawElement` degrada tudo para texto.
- **Texto e imagens**, últimos 100 itens (limite do GPaste); pinos (de texto)
  escapam do limite. Filtro de senha fica para versões futuras.
