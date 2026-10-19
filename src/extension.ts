import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Classifier, type Network, type Result, type State} from './status.js';

const labels: Record<State,string> = {checking:'Checking / unable to verify',connected:'Connected',poor:'Poor connection',offline:'Offline',portal:'Sign-in required'};
export default class ConnectionDot extends Extension {
    private button?: PanelMenu.Button;
    private icon?: St.Icon;
    private detail?: PopupMenu.PopupMenuItem;
    private refresh?: PopupMenu.PopupMenuItem;
    private settings?: Gio.Settings;
    private network?: Gio.NetworkMonitor;
    private session?: Soup.Session;
    private timer = 0;
    private deadline = 0;
    private signal = 0;
    private settingSignal = 0;
    private pending?: Gio.Cancellable;
    private classifier = new Classifier();
    enable() {
        this.settings = this.getSettings();
        this.network = Gio.NetworkMonitor.get_default();
        this.session = new Soup.Session({timeout:5});
        this.button = new PanelMenu.Button(0, 'Connection Dot', false);
        this.icon = new St.Icon({icon_name:'network-transmit-receive-symbolic',style_class:'system-status-icon'});
        this.button.add_child(this.icon);
        this.detail = new PopupMenu.PopupMenuItem('Checking…', {reactive:false});
        (this.button.menu as PopupMenu.PopupMenu).addMenuItem(this.detail);
        this.refresh = new PopupMenu.PopupMenuItem('Check now');
        this.refresh.connect('activate',()=>void this.check());
        (this.button.menu as PopupMenu.PopupMenu).addMenuItem(this.refresh);
        (this.button.menu as PopupMenu.PopupMenu).addAction('Settings',()=>this.openPreferences());
        (this.button.menu as PopupMenu.PopupMenu).addAction('About Connection Dot',()=>Gio.AppInfo.launch_default_for_uri('https://github.com/derrick-nuby/connection-dot',null));
        Main.panel.addToStatusArea(this.uuid,this.button);
        this.signal = this.network.connect('network-changed',()=>this.restart());
        this.settingSignal = this.settings.connect('changed',()=>this.restart());
        this.restart();
    }
    disable() {
        this.stop();
        if(this.network && this.signal) this.network.disconnect(this.signal);
        if(this.settings && this.settingSignal) this.settings.disconnect(this.settingSignal);
        this.signal=this.settingSignal=0;
        this.session?.abort(); this.session=undefined;
        this.button?.destroy(); this.button=undefined; this.icon=undefined;
        this.detail=undefined; this.refresh=undefined; this.settings=undefined; this.network=undefined;
        this.classifier.reset();
    }
    private stop() {
        if(this.timer) GLib.Source.remove(this.timer);
        this.timer=0; if(this.deadline) GLib.Source.remove(this.deadline); this.deadline=0; this.pending?.cancel(); this.pending=undefined;
    }
    private restart() {
        this.stop(); this.classifier.reset(); this.render('checking','');
        this.timer=GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,1,()=>{this.timer=0;void this.check();return GLib.SOURCE_REMOVE;});
    }
    private networkState(): Network {
        if(!this.network?.network_available) return 'none';
        switch(this.network.connectivity) {
            case Gio.NetworkConnectivity.PORTAL:return 'portal';
            case Gio.NetworkConnectivity.LIMITED:return 'limited';
            case Gio.NetworkConnectivity.FULL:return 'full';
            default:return 'unknown';
        }
    }
    private render(state: State, text:string) {
        if(!this.icon || !this.button || !this.detail) return;
        const colors={connected:'#2ec27e',poor:'#e5a50a',offline:'#e01b24',portal:'#e5a50a',checking:'#9a9996'};
        this.icon.style=`color: ${colors[state]};`;
        this.icon.icon_name=state==='offline'?'network-offline-symbolic':state==='poor'||state==='portal'?'network-error-symbolic':'network-transmit-receive-symbolic';
        this.button.accessible_name=`Connection Dot: ${labels[state]}`;
        this.detail.label.text=`${labels[state]}${text ? '\n'+text : ''}`;
    }
    private probe(url:string, expected:string, cancel:Gio.Cancellable): Promise<Result> {
        const start=GLib.get_monotonic_time();
        return new Promise(resolve=>{
            if(!/^https:\/\/[^/@]+(?:\/|$)/.test(url)) {resolve({ok:false,ms:0,reason:'Invalid HTTPS endpoint'});return;}
            const message=Soup.Message.new('GET',url);
            if(!message) {resolve({ok:false,ms:0,reason:'Invalid endpoint'});return;}
            message.set_flags(Soup.MessageFlags.NO_REDIRECT);
            this.session!.send_async(message,GLib.PRIORITY_DEFAULT,cancel,(session,result)=>{
                let stream:Gio.InputStream;
                try { stream=session!.send_finish(result); } catch {resolve({ok:false,ms:0,reason:'Request failed'});return;}
                stream.read_bytes_async(4097,GLib.PRIORITY_DEFAULT,cancel,(input,readResult)=>{
                    try {
                        const bytes=input!.read_bytes_finish(readResult).get_data();
                        const body=new TextDecoder().decode(bytes ?? new Uint8Array());
                        const ok=message.status_code===200 && body.length<=4096 && body.trim()===expected;
                        resolve({ok,ms:Math.round((GLib.get_monotonic_time()-start)/1000),reason:ok?'OK':'Unexpected response'});
                    } catch {resolve({ok:false,ms:0,reason:'Read failed'});}
                    finally {stream.close_async(GLib.PRIORITY_DEFAULT,null,()=>{});}
                });
            });
        });
    }
    private async check() {
        if(this.pending || !this.settings || !this.session) return;
        if(this.timer) {GLib.Source.remove(this.timer);this.timer=0;}
        const active=this.settings.get_boolean('active-checks');
        this.refresh?.setSensitive(false);
        const network=this.networkState();
        if(!active || network==='none' || network==='portal') {
            this.render(network==='none'?'offline':network==='portal'?'portal':'checking',active?'':'Active checks disabled');
            this.schedule(); return;
        }
        const cancel=new Gio.Cancellable(); this.pending=cancel;
        this.deadline=GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,5,()=>{this.deadline=0;cancel.cancel();return GLib.SOURCE_REMOVE;});
        try {
            const results=await Promise.all([
                this.probe('https://detectportal.firefox.com/success.txt','success',cancel),
                this.probe('https://fedoraproject.org/static/hotspot.txt','OK',cancel),
            ]);
            if(this.pending!==cancel) return;
            const state=this.classifier.update(results,this.networkState(),this.settings.get_int('slow-ms'));
            this.render(state,results.map((r,i)=>`${i===0?'Mozilla':'Fedora'}: ${r.ok?r.ms+' ms':r.reason}`).join('\n')+'\nChecked '+new Date().toLocaleTimeString());
        } finally {
            if(this.pending===cancel && this.deadline) {GLib.Source.remove(this.deadline);this.deadline=0;}
            if(this.pending===cancel) {this.pending=undefined;this.schedule();}
        }
    }
    private schedule() {
        if(!this.settings) return;
        const active=this.settings.get_boolean('active-checks');
        this.refresh?.setSensitive(active);
        const interval=Math.max(this.settings.get_int('interval'),this.network?.network_metered?120:15);
        this.timer=GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,interval,()=>{this.timer=0;void this.check();return GLib.SOURCE_REMOVE;});
    }
}
