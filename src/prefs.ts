import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
export default class Preferences extends ExtensionPreferences {
    async fillPreferencesWindow(window:Adw.PreferencesWindow) {
        const settings=this.getSettings();
        const page=new Adw.PreferencesPage({title:'Connection Dot'});
        const group=new Adw.PreferencesGroup({title:'Internet checks',description:'Contacts Mozilla and Fedora over HTTPS. Measures responsiveness, not download speed. Metered connections use at least 120 seconds.'});
        const enabled=new Adw.SwitchRow({title:'Active checks'});
        settings.bind('active-checks',enabled,'active',Gio.SettingsBindFlags.DEFAULT);group.add(enabled);
        for(const [key,title,min,max] of [['interval','Check interval (seconds)',15,300],['slow-ms','Slow response threshold (ms)',250,4500]] as const) {
            const row=new Adw.SpinRow({title,adjustment:new Gtk.Adjustment({lower:min,upper:max,step_increment:key==='interval'?15:250})});
            settings.bind(key,row,'value',Gio.SettingsBindFlags.DEFAULT);group.add(row);
        }
        page.add(group);window.add(page);
    }
}
