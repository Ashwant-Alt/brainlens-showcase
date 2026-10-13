"""Prepare the official, pinned Swin checkpoint after downloading its release ZIP.

Run from the project root with the project's Python environment.
Only weights are loaded, with explicit NumPy scalar metadata types allowed.
"""
from pathlib import Path
import hashlib
import json
import zipfile
import numpy as np
import torch

root = Path(__file__).resolve().parents[2] / 'work' / 'swin-weights'
archive = root / 'official.zip'
expected_archive = '47ba479743f9d5151654d1232d3e8d3aa68d7e9d68a837ef7b8c644329293d63'
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected_archive:
    raise ValueError('Archive differs from the official artifact recorded during integration.')
with zipfile.ZipFile(archive) as bundle:
    raw = bundle.read('fold0_f48_ep300_4gpu_dice0_8854/model.pt')
(root / 'model.pt').write_bytes(raw)
with torch.serialization.safe_globals([np.core.multiarray.scalar, np.dtype,
                                       np.dtypes.Float64DType, np.dtypes.Float32DType]):
    checkpoint = torch.load(root / 'model.pt', map_location='cpu', weights_only=True)
state = checkpoint['state_dict']
if not all(isinstance(k, str) and isinstance(v, torch.Tensor) for k, v in state.items()):
    raise ValueError('Unexpected checkpoint state.')
torch.save({'state_dict': state}, root / 'weights-only.pt')
source = json.loads((root / 'source.json').read_text())
source['weightsOnlySha256'] = hashlib.sha256((root / 'weights-only.pt').read_bytes()).hexdigest()
source['conversion'] = 'Restricted weights-only load with explicit NumPy scalar/dtype allowlist; retained only state_dict'
(root / 'source.json').write_text(json.dumps(source, indent=2))
print('Prepared restricted-load checkpoint:', source['weightsOnlySha256'])
