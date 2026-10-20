import {validEndpoint} from './endpoint.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
export default class Preferences extends ExtensionPreferences {
    async fillPreferencesWindow(window:Adw.PreferencesWindow) {
        const settings=this.getSettings();
        const page=new Adw.PreferencesPage({title:'Connection Dot'});
        const group=new Adw.PreferencesGroup({title:'Internet checks',description:'Checks your configured HTTPS endpoints (Mozilla and Fedora by default). Measures responsiveness, not download speed. Metered connections use at least 120 seconds.'});
        const enabled=new Adw.SwitchRow({title:'Active checks'});
        settings.bind('active-checks',enabled,'active',Gio.SettingsBindFlags.DEFAULT);group.add(enabled);
        for(const [key,title,min,max] of [['interval','Check interval (seconds)',15,300],['deadline','Request deadline (seconds)',2,10],['slow-ms','Slow response threshold (ms)',250,4500]] as const) {
            const row=new Adw.SpinRow({title,adjustment:new Gtk.Adjustment({lower:min,upper:max,step_increment:key==='interval'?15:key==='deadline'?1:250})});
            settings.bind(key,row,'value',Gio.SettingsBindFlags.DEFAULT);group.add(row);
        }
        for(const [key,title] of [['primary-url','Primary HTTPS URL'],['primary-response','Expected primary text'],['secondary-url','Fallback HTTPS URL'],['secondary-response','Expected fallback text']]) {
            const row=new Adw.EntryRow({title});
            settings.bind(key,row,'text',Gio.SettingsBindFlags.DEFAULT);group.add(row);
            if(key.endsWith('-url')) {
                const validate=()=>{
                    const valid=validEndpoint(row.text);
                    if(valid) row.remove_css_class('error'); else row.add_css_class('error');
                    row.tooltip_text=valid ? '' : 'Enter an HTTPS URL with a host, without credentials, spaces, or a fragment.';
                };
                row.connect('notify::text',validate);validate();
            }
        }
        const reset=new Gtk.Button({label:'Reset defaults'});
        reset.connect('clicked',()=>{for(const key of settings.settings_schema.list_keys()) settings.reset(key);});group.add(reset);
        page.add(group);window.add(page);
    }
}
