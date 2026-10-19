import json, pathlib, shutil, subprocess, sys
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
<key name="active-checks" type="b"><default>true</default><summary>Enable HTTPS connectivity checks</summary></key>
<key name="interval" type="i"><range min="15" max="300"/><default>30</default><summary>Seconds between checks</summary></key>
<key name="slow-ms" type="i"><range min="250" max="4500"/><default>1500</default><summary>Slow response threshold</summary></key>
</schema></schemalist>''')
shutil.copy(root/'LICENSE',stage/'LICENSE')
subprocess.run(['glib-compile-schemas','--strict',str(stage/'schemas')],check=True)
out=root/'artifacts';out.mkdir(exist_ok=True)
subprocess.run(['gnome-extensions','pack',str(stage),'--force','--out-dir',str(out),'--extra-source=status.js','--extra-source=LICENSE'],check=True)
shutil.move(out/f'{uuid}.shell-extension.zip',out/f'{name}.shell-extension.zip')
subprocess.run([sys.executable,str(root/'scripts/verify.py'),str(out/f'{name}.shell-extension.zip')],check=True)
