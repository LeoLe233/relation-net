"""Create a portable archive without hosting identity, credentials or user data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
target = root / 'dist' / 'relation-net-source.zip'
files = [root / name for name in ['README.md', 'LICENSE', 'package.json', '.gitignore', 'start-local.py', 'start-windows.bat', 'start-macos.command']]
for directory in ['dist', 'tests', 'scripts']:
    files.extend(path for path in (root / directory).rglob('*')
                 if path.is_file() and path != target and '__pycache__' not in path.parts
                 and '.openai' not in path.parts and path.suffix not in {'.pyc', '.zip', '.tar', '.gz'})
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(files):
        archive.write(path, Path('relation-net') / path.relative_to(root))
print(f'Created {target.name} ({target.stat().st_size:,} bytes)')
