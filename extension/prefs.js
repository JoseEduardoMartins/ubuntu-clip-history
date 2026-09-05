// Preferências — só o atalho (editável).
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const KEY = 'toggle-clip-history';

export default class ClipHistoryPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: 'Atalho' });
        page.add(group);

        // Linha ativável: clicar (ou Enter) abre a captura da nova combinação.
        const row = new Adw.ActionRow({
            title: 'Abrir o histórico',
            subtitle: 'Clique para redefinir · Backspace limpa',
            activatable: true,
        });

        const label = new Gtk.ShortcutLabel({
            valign: Gtk.Align.CENTER,
            // disabled-text aparece quando o atalho está vazio (desabilitado).
            disabled_text: 'Desabilitado',
            accelerator: settings.get_strv(KEY)[0] ?? '',
        });
        settings.connect(`changed::${KEY}`, () => {
            label.set_accelerator(settings.get_strv(KEY)[0] ?? '');
        });
        row.add_suffix(label);
        row.connect('activated', () => this._captureShortcut(window, settings));
        group.add(row);

        window.add(page);
    }

    // Diálogo modal que lê a próxima combinação de teclas e a grava em `KEY`.
    // Esc cancela sem mudar; Backspace limpa (desabilita o atalho); qualquer
    // combinação com modificador válida é aceita e fecha o diálogo.
    _captureShortcut(window, settings) {
        const dialog = new Adw.Window({
            modal: true,
            transient_for: window,
            resizable: false,
            default_width: 380,
            default_height: 180,
            title: 'Novo atalho',
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 24,
            margin_end: 24,
            valign: Gtk.Align.CENTER,
        });
        box.append(new Gtk.Label({
            label: 'Aperte a nova combinação de teclas',
            wrap: true,
        }));
        box.append(new Gtk.Label({
            label: 'Esc cancela · Backspace desabilita',
            wrap: true,
            css_classes: ['dim-label'],
        }));
        dialog.set_content(box);

        const controller = new Gtk.EventControllerKey();
        controller.connect('key-pressed', (_c, keyval, _keycode, state) => {
            let mask = state & Gtk.accelerator_get_default_mod_mask();
            mask &= ~Gdk.ModifierType.LOCK_MASK;

            // Esc puro: cancela sem alterar.
            if (mask === 0 && keyval === Gdk.KEY_Escape) {
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            // Backspace puro: limpa o atalho (desabilita a abertura por tecla).
            if (mask === 0 && keyval === Gdk.KEY_BackSpace) {
                settings.set_strv(KEY, []);
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            // Exige um modificador + combinação válida; senão ignora e segue
            // aguardando (evita gravar uma tecla solta que não abriria nada).
            if (mask === 0 || !Gtk.accelerator_valid(keyval, mask))
                return Gdk.EVENT_STOP;

            settings.set_strv(KEY, [Gtk.accelerator_name(keyval, mask)]);
            dialog.close();
            return Gdk.EVENT_STOP;
        });
        dialog.add_controller(controller);

        dialog.present();
    }
}
