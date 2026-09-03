# Design: clip-history como extensão do GNOME Shell

**Data:** 2026-09-01
**Status:** Aprovado (brainstorming) — pré-implementação

## Objetivo

Reescrever o picker de histórico de clipboard como uma **extensão do GNOME
Shell**, para poder **controlar o posicionamento da janela** — algo impossível
para um app GTK toplevel no Wayland/GNOME (o compositor decide a posição; o
GTK4 removeu `move`/`set_position`).

Comportamento de posicionamento desejado:

- **Padrão:** canto **inferior direito** do monitor ativo.
- **Com campo de texto em foco:** logo **abaixo do caret** (cursor de texto); se
  não couber abaixo, **acima** do caret.

## Contexto e restrições (validados)

- GNOME Shell **46** / Wayland / Ubuntu. Extensões movem/posicionam actors e
  janelas livremente (ex.: `native-window-placement`, `auto-move-windows`).
- **GPaste 45** instalado e rodando (daemon dentro do gnome-shell); já é a fonte
  do nosso histórico (ver `watcher.py`, que escuta o sinal D-Bus `Update` e lê
  `GetElementAtIndex`, sem roubar foco).
- **IBus** ativo — fornece a posição do caret do campo em foco (mesmo sinal que
  o seletor de emoji / popup de candidatos do GNOME usa). Âncora = **caret**
  (decisão do usuário; o retângulo exato da caixa de texto não é obtível de
  forma confiável entre apps sem acessibilidade ligada).
- AT-SPI existe, mas `toolkit-accessibility=false` → **não** usamos AT-SPI.

## Decisões de escopo (fechadas no brainstorming)

1. **Abordagem A:** reescrita completa da UI como popup St dentro do shell (não
   um mero "posicionador" sobre a UI GTK).
2. **Fonte de dados:** **daemon D-Bus Python**, fundido no processo que já
   escuta o GPaste. A extensão nunca toca no SQLite direto.
3. **Features:** paridade total — lista + selecionar/colar, busca/filtro,
   fixar (pino), excluir item, limpar tudo, navegação por teclado.
4. **Colar:** a extensão faz `St.Clipboard.set_text` + injeta **Ctrl+V** via
   dispositivo virtual do Clutter (**sem ydotool**).
5. **Atalho:** a extensão é dona do **Super+V**; o **picker GTK é removido**.
6. **Alcance:** **distribuível** (multi-versão do GNOME Shell 45+, com vista à
   publicação no extensions.gnome.org).

## Arquitetura

Dois componentes:

### 1. Daemon `clip-history` (Python)

É o atual processo `watch`, estendido. Continua ingerindo do GPaste e gravando
no SQLite (pin/dedup/cap intactos), e passa a **expor um serviço D-Bus**.

- **Bus name:** `com.joseeduardomartins.ClipHistory`
- **Objeto:** `/com/joseeduardomartins/ClipHistory`
- **Interface:** `com.joseeduardomartins.ClipHistory`

| Membro | Assinatura | Semântica |
|---|---|---|
| `GetHistory()` | `→ a(xssb)` | `(id, content, created_at, pinned)`, ordenado como hoje (fixados no topo, depois id desc). |
| `SetPinned(id, pinned)` | `(xb) →` | Fixa/desafixa; no-op se id não existe. |
| `Delete(id)` | `(x) →` | Remove um item; no-op se não existe. |
| `Clear()` | `→` | Limpa tudo. |
| `Changed` (sinal) | `→` | Emitido após **qualquer** mutação (ingest, pin, delete, clear). |

- `id` é `x` (int64) por segurança. Modelo espelha `storage.Entry`.
- Sem método de "paste": a extensão já tem o `content` da `GetHistory`.

**Estrutura Python:**

- Novo módulo `clip_history/daemon.py` com `run()`, que roda **um** GLib main
  loop hospedando: (a) o listener do GPaste e (b) o serviço D-Bus
  (`Gio.bus_own_name` + `Gio.DBusNodeInfo` a partir do XML da interface).
- Refatorar `watcher.py`: extrair a montagem do proxy do GPaste + assinatura do
  sinal `Update` numa função que recebe um callback `on_new_text` e **não** é
  dona do loop. O `Tracker` continua igual.
- **Wiring do `Changed`:** o ingest usa `Tracker(add=wrapper)`, onde o wrapper
  faz `storage.add(text)` e emite `Changed`. Os handlers `SetPinned/Delete/
  Clear` chamam o `storage` e emitem `Changed`.
- Concorrência: chamadas D-Bus chegam no main loop; SQLite é síncrono e rápido
  (WAL já ligado) — sem threads.
- Erros: ids inexistentes são no-op; falha de SQLite loga em stderr e não
  derruba o daemon.
- Comando: `clip-history daemon` (o `watch` atual vira isso).

### 2. Extensão do GNOME Shell (GJS, ESM)

Arquivos: `extension.js` (`enable/disable`), `prefs.js` (só o atalho),
`metadata.json`, `stylesheet.css`, `schemas/…gschema.xml`.
UUID: `clip-history@joseeduardomartins.com`.

- **D-Bus proxy** para o daemon (chamadas assíncronas; conecta ao `Changed`).
- **Atalho:** `Main.wm.addKeybinding('toggle-clip-history', settings, …)` com a
  tecla no gschema (`['<Super>v']`). Depende de o Super+V estar livre do
  `toggle-message-tray` (o `setup` já faz isso).
- **Captura do caret (SPIKE #1):** lê o retângulo do caret da mesma fonte que o
  popup de candidatos do IBus usa (localização do cursor do input method do
  shell). "Há campo de texto em foco?" = input method com foco ativo **e**
  retângulo de caret válido. Capturado **no gatilho**, antes do popup roubar o
  foco.
- **UI (St)**, espelhando o picker atual: container vertical estilizado (cantos
  arredondados, sombra), largura fixa (~420px), `St.ScrollView` com altura
  máxima. Título "Área de Transferência" + botão de fechar; `St.Entry` de busca;
  linhas com label (`Clutter.Text` ellipsize END, uma linha) + toggle de pino +
  botão excluir; botão "Limpar tudo" com confirmação. Teclado: ↑/↓ seleção,
  Enter cola, Esc fecha, Ctrl+P fixa, Alt+1..9 escolha rápida, digitar → busca.
- **Posicionamento** (usando a **work area** do monitor, respeitando painel/
  docks) — implementado como **função pura** testável:
  - Com caret: `x = clamp(caret.x, dentro da área)`, `y = caret.y +
    caret.height + gap`. Se estourar embaixo → acima (`y = caret.y - popupH -
    gap`); se nem acima couber, clamp dentro do monitor.
  - Sem caret: canto inferior direito — `x = area.x + area.width - popupW -
    margem`, `y = area.y + area.height - popupH - margem`.
  - Monitor = o do caret/janela em foco; senão o atual.
- **Selecionar → colar (SPIKES #2 e #3):**
  1. `St.Clipboard.set_text(CLIPBOARD, content)`.
  2. Fecha o popup (`popModal` + destrói) → o Mutter devolve o foco à janela
     anterior.
  3. Injeta Ctrl+V via dispositivo virtual do Clutter
     (`seat.create_virtual_device(KEYBOARD)` → `notify_keyval` press/release de
     Control_L + V), com atraso ~50-100ms pra o app-alvo já ter o foco.
  - O `set_text` faz o GPaste capturar → o item sobe ao topo (consistente).
- **Refresh ao vivo:** com o popup aberto, ao receber `Changed`, re-busca
  `GetHistory` e reconstrói a lista (preserva busca/seleção o possível).
- **Teardown limpo (EGO):** `disable()` remove o atalho, destrói o popup,
  solta o proxy, desconecta sinais e descarta o dispositivo virtual.

## Fluxo de dados

- Copiar → GPaste → daemon grava no SQLite → `Changed` → (se popup aberto)
  atualiza.
- Super+V → captura caret → popup → `GetHistory` → renderiza posicionado.
- Escolher → clipboard + Ctrl+V.
- Pino/excluir/limpar → método D-Bus → `Changed` → refresh.

## Empacotamento e migração

**`clip-history setup` passa a:**

1. Instalar o launcher (mantém).
2. Instalar a extensão: copiar `extension/` → `~/.local/share/gnome-shell/
   extensions/<uuid>/`, compilar o gschema, `gnome-extensions enable <uuid>`.
3. Instalar/habilitar `clip-history.service` (ExecStart `clip-history daemon`,
   After/Wants `org.gnome.GPaste.service`); **migrar**: desabilitar/remover
   `clip-history-watch.service` e `ydotoold.service`.
4. Remover o atalho custom antigo do GNOME (rodava `clip-history show`); manter
   `free_super_v()`.
5. Garantir GPaste instalado/habilitado.
6. Avisar: **logout/login** (Wayland recarrega o shell pra ver a extensão nova
   e o Super+V).

**systemd:** `systemd/clip-history.service` (renomeado). Remover
`ydotoold.service`.

**Limpeza (consequência do novo caminho de colar):** remover `paste.py`,
`test_paste.py`, `picker.py`, `test_picker.py`, `systemd/ydotoold.service`.
Dependências que saem: **ydotool**, **wl-clipboard**, **GTK4/Adw**. Ficam:
**GPaste**, **python3-gi**, **GNOME Shell 45+**. `cli.py`: comandos `daemon`,
`record`, `setup` (remove `show`).

**Multi-versão:** `metadata.json` `shell-version` = 45, 46, 47, 48 (todas ESM;
≤44 fora). Onde a API variar, feature-detect. Publicação no EGO
(`gnome-extensions pack`) é passo opcional pós-MVP.

## Testes

- **Daemon Python:** testes de unidade da camada de lógica (handlers que chamam
  `storage` + emitem um `emit_changed` injetável — asserta efeito no storage e a
  emissão), no estilo atual. A fiação Gio/D-Bus (fina) é validada por um
  **smoke de integração** contra o bus real.
- **Extensão:** a matemática de **posicionamento** é uma **função pura**,
  testada com o interpretador `gjs` (dado caret + work area + tamanho → x,y). O
  resto (caret, injeção, foco) é validado pelos **3 spikes** e por teste manual
  de aceitação.

## Riscos / Spikes (validar primeiro)

1. **Caret via IBus** dentro da extensão (GNOME 46).
2. **Injeção de Ctrl+V** com dispositivo virtual do Clutter, entregue ao app
   certo.
3. **Grab modal + devolução de foco** no timing certo pra o Ctrl+V cair no app
   de origem.

Se algum spike falhar, reavaliar: (1) sem caret confiável → sempre canto
inferior direito; (2/3) sem injeção nativa confiável → fallback para o caminho
ydotool via daemon (reintroduzindo a dependência).

## Ordem de execução (vira o plano)

1. Spikes (caret, Ctrl+V, foco).
2. Daemon D-Bus (+ testes).
3. Esqueleto da extensão + atalho + proxy + render da lista.
4. Posicionamento (função pura + wire).
5. Injeção do Ctrl+V.
6. Pino/excluir/limpar/busca + refresh ao vivo.
7. setup/systemd/empacotamento + limpeza + README.

## Fora de escopo (por ora)

- Publicação efetiva no EGO (preparado, mas opcional).
- Suporte a GNOME Shell ≤ 44 (pré-ESM).
- Imagens no histórico; filtro de senha.
