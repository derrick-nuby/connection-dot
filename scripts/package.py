import json, pathlib, shutil, subprocess, sys, zipfile
root=pathlib.Path(__file__).resolve().parent.parent
dev='--dev' in sys.argv
name='connection-dot'+('-dev' if dev else '')
uuid=name+'@derrick-nuby.github.io'
stage=root/'build'/name
shutil.rmtree(stage,ignore_errors=True)
shutil.copytree(root/'dist',stage,ignore=shutil.ignore_patterns('*.map') if not dev else None)
version=json.loads((root/'package.json').read_text())['version'].replace('-',' ')
if len(version)>16: raise ValueError('version-name too long')
schema='org.gnome.shell.extensions.'+name
(stage/'metadata.json').write_text(json.dumps({'uuid':uuid,'name':'Connection Dot'+(' (Development)' if dev else ''),'description':'Internet responsiveness in the top bar. Periodically contacts Mozilla and Fedora; configurable in preferences.','shell-version':['48','49','50'],'url':'https://github.com/derrick-nuby/connection-dot','settings-schema':schema,'version-name':version},indent=2))
(stage/'schemas').mkdir()
(stage/'schemas'/f'{schema}.gschema.xml').write_text(f'''<schemalist><schema id="{schema}" path="/org/gnome/shell/extensions/{name}/">
<key name="primary-url" type="s"><default>'https://detectportal.firefox.com/success.txt'</default><summary>Primary HTTPS endpoint</summary></key>
<key name="primary-response" type="s"><default>'success'</default><summary>Expected primary response</summary></key>
<key name="secondary-url" type="s"><default>'https://fedoraproject.org/static/hotspot.txt'</default><summary>Fallback HTTPS endpoint</summary></key>
<key name="secondary-response" type="s"><default>'OK'</default><summary>Expected fallback response</summary></key>
<key name="deadline" type="i"><range min="2" max="10"/><default>5</default><summary>Request deadline in seconds</summary></key>
<key name="active-checks" type="b"><default>true</default><summary>Enable HTTPS connectivity checks</summary></key>
<key name="interval" type="i"><range min="15" max="300"/><default>30</default><summary>Seconds between checks</summary></key>
<key name="slow-ms" type="i"><range min="250" max="4500"/><default>1500</default><summary>Slow response threshold</summary></key>
</schema></schemalist>''')
shutil.copy(root/'LICENSE',stage/'LICENSE')
subprocess.run(['glib-compile-schemas','--strict',str(stage/'schemas')],check=True)
out=root/'artifacts';out.mkdir(exist_ok=True)
subprocess.run(['gnome-extensions','pack',str(stage),'--force','--out-dir',str(out),*[f'--extra-source={p.name}' for p in sorted(stage.glob('*.js')) if p.name not in ('extension.js','prefs.js')],'--extra-source=LICENSE'],check=True)
shutil.move(out/f'{uuid}.shell-extension.zip',out/f'{name}.shell-extension.zip')
# Normalize timestamps and ordering so retries produce identical release assets.
archive=out/f'{name}.shell-extension.zip'
with zipfile.ZipFile(archive) as z:
    entries={name:z.read(name) for name in z.namelist()}
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
    for entry,data in sorted(entries.items()):
        info=zipfile.ZipInfo(entry,date_time=(1980,1,1,0,0,0))
        info.compress_type=zipfile.ZIP_DEFLATED
        info.external_attr=(0o40755 if entry.endswith('/') else 0o100644)<<16
        z.writestr(info,data)
subprocess.run([sys.executable,str(root/'scripts/verify.py'),str(out/f'{name}.shell-extension.zip')],check=True)
