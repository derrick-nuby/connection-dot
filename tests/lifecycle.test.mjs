import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the compiled controller with deterministic GI boundaries. Desktop
// tests remain necessary for GNOME's real actors, D-Bus, and network backend.
const sources=new Map();let next=1;
class Cancellable { cancelled=false;cancel(){this.cancelled=true;}is_cancelled(){return this.cancelled;} }
globalThis.__connectionDotTest={
    St:{},Clutter:{},Gio:{Cancellable,NetworkConnectivity:{LOCAL:1,LIMITED:2,FULL:3,PORTAL:4}},
    GLib:{PRIORITY_DEFAULT:0,SOURCE_REMOVE:false,timeout_add_seconds:(_p,_s,fn)=>{const id=next++;sources.set(id,fn);return id;},Source:{remove:id=>sources.delete(id)}},
    Soup:{},Extension:class {},Main:{},PanelMenu:{},PopupMenu:{},validEndpoint:()=>true,
};
let code=await readFile(new URL('../dist/extension.js',import.meta.url),'utf8');
code=code.replace(/^import .* from '(?:gi:|resource:|\.\/endpoint).*;\n/gm,'');
code=code.replace("'./status.js'",JSON.stringify(new URL('../dist/status.js',import.meta.url).href));
code='const {St,Clutter,Gio,GLib,Soup,Extension,Main,PanelMenu,PopupMenu,validEndpoint}=globalThis.__connectionDotTest;\n'+code;
const {default:Controller}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function controller(){
    sources.clear();const c=new Controller();
    c.settings={get_boolean:()=>true,get_int:k=>({deadline:5,'slow-ms':1500,interval:30}[k]),get_string:()=>''};
    c.network={network_available:true,connectivity:3};c.session={abort(){}};
    c.render=(...args)=>{c.lastRender=args;};return c;
}
const success={ok:true,ms:100,reason:'OK'};
test('unexpected probe failure is handled and schedules recovery',async()=>{
    const c=controller();c.probe=async()=>{throw new Error('fixture failure');};
    const original=console.error;console.error=()=>{};
    try{await c.check();}finally{console.error=original;}
    assert.equal(c.lastRender[0],'checking');assert.equal(c.pending,undefined);assert.equal(sources.size,1);
});
test('disable cancels in-flight cycle and ignores late results',async()=>{
    const c=controller();let resolve;c.probe=()=>new Promise(r=>{resolve=r;});
    // Both probes share the same deferred completion.
    const pending=new Promise(r=>{resolve=r;});c.probe=()=>pending;
    const run=c.check();const cancel=c.pending;c.disable();resolve(success);await run;
    assert.equal(cancel.cancelled,true);assert.equal(c.lastRender,undefined);assert.equal(sources.size,0);
});
test('deadline cancels requests and the completed cycle retries',async()=>{
    const c=controller();let resolve;const pending=new Promise(r=>{resolve=r;});c.probe=()=>pending;
    const run=c.check();const cancel=c.pending;const id=c.deadline;const fn=sources.get(id);sources.delete(id);fn();
    assert.equal(cancel.cancelled,true);resolve({ok:false,ms:5000,reason:'Request failed'});await run;
    assert.equal(c.pending,undefined);assert.equal(sources.size,1);
});
test('restart invalidates old results without duplicating timers',async()=>{
    const c=controller();let resolve;const pending=new Promise(r=>{resolve=r;});c.probe=()=>pending;
    const run=c.check();c.restart();resolve(success);await run;
    assert.deepEqual(c.lastRender,['checking','']);assert.equal(sources.size,1);
});
test('local-only system connectivity is limited',()=>{const c=controller();c.network.connectivity=1;assert.equal(c.networkState(),'limited');});
test('probe bounds response size and rejects redirects and unexpected bodies',async()=>{
    const env=globalThis.__connectionDotTest;
    env.GLib.get_monotonic_time=()=>1000;
    env.Soup.MessageFlags={NO_REDIRECT:1};
    for(const [status,body,ok,reason] of [[200,'success',true,'OK'],[302,'success',false,'Unexpected response'],[200,'wrong',false,'Unexpected response'],[200,'x'.repeat(4097),false,'Response too large']]){
        const c=controller();let flags;let closed=false;let offset=0;
        env.Soup.Message={new:()=>({status_code:status,set_flags:f=>{flags=f;}})};
        const data=new TextEncoder().encode(body);
        const stream={
            read_bytes_async:(size,_p,_c,cb)=>{const bytes=data.slice(offset,offset+size);offset+=bytes.length;queueMicrotask(()=>cb(stream,bytes));},
            read_bytes_finish:bytes=>({get_data:()=>bytes}),
            close_async:(_p,_c,cb)=>cb(stream,{}),close_finish:()=>{closed=true;},
        };
        c.session={send_async:(_m,_p,_c,cb)=>cb(c.session,{}),send_finish:()=>stream};
        const result=await c.probe('https://example.org','success',new Cancellable());
        assert.equal(result.ok,ok);assert.equal(result.reason,reason);assert.equal(flags,1);assert.equal(closed,true);
    }
});
