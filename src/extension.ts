import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {validEndpoint} from './endpoint.js';
import {Classifier, type Network, type Result, type State} from './status.js';

const labels: Record<State,string> = {checking:'Checking / unable to verify',connected:'Connected',poor:'Poor connection',offline:'Offline',portal:'Sign-in required'};
export default class ConnectionDot extends Extension {
    private button?: PanelMenu.Button;
    private icon?: St.Widget;
    private detail?: PopupMenu.PopupMenuItem;
    private refresh?: PopupMenu.PopupMenuItem;
    private settings?: Gio.Settings;
    private network?: Gio.NetworkMonitor;
    private session?: Soup.Session;
    private timer = 0;
    private deadline = 0;
    private signal = 0;
    private settingSignal = 0;
    private sleepSignal = 0;
    private pending?: Gio.Cancellable;
    private preferencesRequest?: Gio.Cancellable;
    private classifier = new Classifier();
    enable() {
        this.settings = this.getSettings();
        this.network = Gio.NetworkMonitor.get_default();
        this.session = new Soup.Session();
        this.button = new PanelMenu.Button(0, 'Connection Dot', false);
        this.icon = new St.Widget({width:20,height:20,x_align:Clutter.ActorAlign.CENTER,y_align:Clutter.ActorAlign.CENTER,reactive:false});
        this.button.add_child(this.icon);
        this.detail = new PopupMenu.PopupMenuItem('Checking…', {reactive:false});
        (this.button.menu as PopupMenu.PopupMenu).addMenuItem(this.detail);
        this.refresh = new PopupMenu.PopupMenuItem('Check now');
        this.refresh.connect('activate',()=>void this.check());
        (this.button.menu as PopupMenu.PopupMenu).addMenuItem(this.refresh);
        (this.button.menu as PopupMenu.PopupMenu).addAction('Settings',()=>this.showSettings());
        (this.button.menu as PopupMenu.PopupMenu).addAction('About Connection Dot',()=>Gio.AppInfo.launch_default_for_uri('https://github.com/derrick-nuby/connection-dot',null));
        Main.panel.addToStatusArea(this.uuid,this.button);
        this.signal = this.network.connect('network-changed',()=>this.restart());
        this.settingSignal = this.settings.connect('changed',()=>this.restart());
        this.sleepSignal=Gio.DBus.system.signal_subscribe(
            'org.freedesktop.login1','org.freedesktop.login1.Manager','PrepareForSleep',
            '/org/freedesktop/login1',null,Gio.DBusSignalFlags.NONE,
            (_connection,_sender,_path,_interface,_signal,parameters)=>{
                const [sleeping]=parameters.deepUnpack() as [boolean];
                if(sleeping) this.stop(); else this.restart();
            });
        this.restart();
    }
    disable() {
        this.stop();
        if(this.sleepSignal) Gio.DBus.system.signal_unsubscribe(this.sleepSignal);
        this.sleepSignal=0;
        this.preferencesRequest?.cancel(); this.preferencesRequest=undefined;
        if(this.network && this.signal) this.network.disconnect(this.signal);
        if(this.settings && this.settingSignal) this.settings.disconnect(this.settingSignal);
        this.signal=this.settingSignal=0;
        this.session?.abort(); this.session=undefined;
        this.button?.destroy(); this.button=undefined; this.icon=undefined;
        this.detail=undefined; this.refresh=undefined; this.settings=undefined; this.network=undefined;
        this.classifier.reset();
    }
    private showSettings() {
        if(this.preferencesRequest) return;
        const request=new Gio.Cancellable();
        this.preferencesRequest=request;
        // Shell 50's openPreferences() drops the D-Bus promise. Finish this call
        // explicitly so clicking Settings with a dialog open cannot reject unhandled.
        Gio.DBus.session.call(
            'org.gnome.Shell.Extensions', '/org/gnome/Shell/Extensions',
            'org.gnome.Shell.Extensions', 'OpenExtensionPrefs',
            new GLib.Variant('(ssa{sv})',[this.uuid,'',{}]),
            null, Gio.DBusCallFlags.NONE, -1, request,
            (connection,result)=>{
                try { connection!.call_finish(result); }
                catch(error) {
                    if(!request.is_cancelled()) {
                        const message=error instanceof Error ? error.message : String(error);
                        if(!message.includes('Already showing a prefs dialog'))
                            console.error('Connection Dot: could not open Settings:',message);
                    }
                } finally {
                    if(this.preferencesRequest===request) this.preferencesRequest=undefined;
                }
            });
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
            case Gio.NetworkConnectivity.LOCAL:
            case Gio.NetworkConnectivity.LIMITED:return 'limited';
            case Gio.NetworkConnectivity.FULL:return 'full';
            default:return 'unknown';
        }
    }
    private render(state: State, text:string) {
        if(!this.icon || !this.button || !this.detail) return;
        const colors={connected:'#2ec27e',poor:'#e5a50a',offline:'#e01b24',portal:'#e5a50a',checking:'#3584e4'};
        this.icon.style=`width: 20px; height: 20px; border-radius: 10px; background-color: ${colors[state]};`;
        this.button.accessible_name=`Connection Dot: ${labels[state]}`;
        this.detail.label.text=`${labels[state]}${text ? '\n'+text : ''}`;
    }
    private probe(url:string, expected:string, cancel:Gio.Cancellable): Promise<Result> {
        const start=GLib.get_monotonic_time();
        return new Promise(resolve=>{
            if(!validEndpoint(url)) {resolve({ok:false,ms:0,reason:'Invalid HTTPS endpoint'});return;}
            const message=Soup.Message.new('GET',url);
            if(!message) {resolve({ok:false,ms:0,reason:'Invalid endpoint'});return;}
            message.set_flags(Soup.MessageFlags.NO_REDIRECT);
            this.session!.send_async(message,GLib.PRIORITY_DEFAULT,cancel,(session,result)=>{
                let stream:Gio.InputStream;
                try { stream=session!.send_finish(result); } catch {resolve({ok:false,ms:0,reason:'Request failed'});return;}
                const chunks: Uint8Array[]=[];
                let size=0;
                const finish=(ok:boolean,reason:string)=>{
                    stream.close_async(GLib.PRIORITY_DEFAULT,null,(source,result)=>{
                        try { source!.close_finish(result); } catch { /* Closing cannot change the probe result. */ }
                    });
                    resolve({ok,ms:Math.round((GLib.get_monotonic_time()-start)/1000),reason});
                };
                const read=()=>stream.read_bytes_async(Math.min(1024,4097-size),GLib.PRIORITY_DEFAULT,cancel,(input,readResult)=>{
                    try {
                        const bytes=input!.read_bytes_finish(readResult).get_data();
                        if(bytes && bytes.length) {
                            size+=bytes.length;
                            if(size>4096) {finish(false,'Response too large');return;}
                            chunks.push(bytes);read();return;
                        }
                        const data=new Uint8Array(size);let offset=0;
                        for(const chunk of chunks) {data.set(chunk,offset);offset+=chunk.length;}
                        const ok=message.status_code===200 && new TextDecoder().decode(data).trim()===expected;
                        finish(ok,ok?'OK':'Unexpected response');
                    } catch {finish(false,'Read failed');}
                });
                read();
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
        this.deadline=GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,this.settings.get_int('deadline'),()=>{this.deadline=0;cancel.cancel();return GLib.SOURCE_REMOVE;});
        try {
            const results=await Promise.all([
                this.probe(this.settings.get_string('primary-url'),this.settings.get_string('primary-response'),cancel),
                this.probe(this.settings.get_string('secondary-url'),this.settings.get_string('secondary-response'),cancel),
            ]);
            if(this.pending!==cancel) return;
            const state=this.classifier.update(results,this.networkState(),Math.min(this.settings.get_int('slow-ms'),this.settings.get_int('deadline')*1000-1));
            this.render(state,results.map((r,i)=>`${i===0?'Primary':'Fallback'}: ${r.ok?r.ms+' ms':r.reason}`).join('\n')+'\nChecked '+new Date().toLocaleTimeString());
        } catch(error) {
            if(this.pending===cancel) {
                this.render('checking','Unable to complete check; retrying automatically');
                console.error('Connection Dot: check failed:',error);
            }
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
