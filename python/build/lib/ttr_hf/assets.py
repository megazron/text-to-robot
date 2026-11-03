"""Download data only: never import or execute Hugging Face repository code."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import urllib.request


def source_lock():
    return json.loads(Path(__file__).with_name('so101.lock.json').read_text())


def verify_file(path, expected):
    return (path.is_file() and path.stat().st_size == expected['bytes']
            and hashlib.sha256(path.read_bytes()).hexdigest() == expected['sha256'])


def fetch_assets(cache, *, offline=False):
    """Verify all files, repairing missing/corrupt entries unless offline."""
    cache = Path(cache)
    lock = source_lock()
    for name, expected in lock['files'].items():
        relative = PurePosixPath(name)
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError(f'Unsafe asset path: {name}')
        path = cache / name
        if verify_file(path, expected):
            continue
        if offline:
            raise ValueError(f'Missing or modified pinned asset: {name}')
        url = f"https://huggingface.co/{lock['repo_id']}/resolve/{lock['revision']}/{name}"
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read(expected['bytes'] + 1)
        if len(data) != expected['bytes'] or hashlib.sha256(data).hexdigest() != expected['sha256']:
            raise ValueError(f'Asset hash mismatch: {name}')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    return cache / lock['model']
