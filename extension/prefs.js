// Preferências — só o atalho.
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ClipHistoryPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: 'Atalho' });
        page.add(group);

        const row = new Adw.ActionRow({
            title: 'Abrir o histórico',
            subtitle: 'Padrão: Super+V',
        });

        const label = new Gtk.ShortcutLabel({
            valign: Gtk.Align.CENTER,
            accelerator: settings.get_strv('toggle-clip-history')[0] ?? '',
        });
        settings.connect('changed::toggle-clip-history', () => {
            label.set_accelerator(settings.get_strv('toggle-clip-history')[0] ?? '');
        });
        row.add_suffix(label);
        group.add(row);

        window.add(page);
    }
}
