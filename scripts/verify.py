import hashlib,json,pathlib,sys,zipfile
p=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'artifacts/connection-dot.shell-extension.zip')
with zipfile.ZipFile(p) as z:
    names=z.namelist()
    for required in ['extension.js','prefs.js','status.js','metadata.json','LICENSE']:
        assert required in names,required
    assert not any(n.endswith(('.ts','.map')) or '..' in n or n.startswith('/') for n in names)
    m=json.loads(z.read('metadata.json'))
    assert 'version' not in m
    assert m['shell-version']==['48','49','50']
    assert f"schemas/{m['settings-schema']}.gschema.xml" in names
p.with_suffix('.zip.sha256').write_text(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n')
print('Verified',p)
