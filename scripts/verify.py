"""Validate the installable archive before generating its checksum."""
import hashlib
import json
import pathlib
import re
import sys
import subprocess
import tempfile
import zipfile
import xml.etree.ElementTree as ET

p = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'artifacts/connection-dot.shell-extension.zip')
dev = p.name == 'connection-dot-dev.shell-extension.zip'
name = 'connection-dot' + ('-dev' if dev else '')
schema = 'org.gnome.shell.extensions.' + name
required = {'extension.js', 'prefs.js', 'status.js', 'endpoint.js', 'metadata.json', 'LICENSE',
            f'schemas/{schema}.gschema.xml'}
with zipfile.ZipFile(p) as z:
    names = z.namelist()
    assert len(names) == len(set(names)), 'Duplicate archive entries'
    files = {n for n in names if not n.endswith('/')}
    assert files == required, f'Unexpected or missing files: {files ^ required}'
    assert all(not n.startswith('/') and '..' not in pathlib.PurePosixPath(n).parts for n in names)
    m = json.loads(z.read('metadata.json'))
    assert m['uuid'] == name + '@derrick-nuby.github.io'
    assert m['name'] == 'Connection Dot' + (' (Development)' if dev else '')
    assert m['settings-schema'] == schema
    assert 'version' not in m
    assert m['shell-version'] == ['48', '49', '50']
    package = json.loads((pathlib.Path(__file__).resolve().parent.parent / 'package.json').read_text())
    assert m['version-name'] == package['version'].replace('-', ' ')
    with tempfile.TemporaryDirectory() as directory:
        target = pathlib.Path(directory) / f'{schema}.gschema.xml'
        target.write_bytes(z.read(f'schemas/{schema}.gschema.xml'))
        subprocess.run(['glib-compile-schemas', '--strict', directory], check=True)
        assert (pathlib.Path(directory) / 'gschemas.compiled').stat().st_size > 0
    root = ET.fromstring(z.read(f'schemas/{schema}.gschema.xml'))
    assert root.find('schema').attrib['id'] == schema
    for filename in files:
        if filename.endswith('.js'):
            for dependency in re.findall(r"(?:from\s+|import\s*)['\"](\./[^'\"]+)['\"]", z.read(filename).decode()):
                assert dependency[2:] in files, f'Missing import: {dependency}'
p.with_suffix('.zip.sha256').write_text(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.name + '\n')
print('Verified', p)
