import os
import importlib.util
from pathlib import Path
os.environ['CUBLAS_WORKSPACE_CONFIG']=':4096:8'
_project_root=Path(__file__).resolve().parents[2]
_helper_path=_project_root/'outputs/brainlens-tumour-presence-data-v1/prepare_detection.py'
_spec=importlib.util.spec_from_file_location('website_bound_gpu_imports',_helper_path)
_helper=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_helper)

# Use only the already-installed, pinned CPU Swin einops package. Do not add CPU torch to sys.path.
import sys
import hashlib
import importlib.abc
import importlib.machinery
_einops_dir = _project_root / 'work/ml-venv/Lib/site-packages/einops'
_einops_bindings = [{"path": "__init__.py", "sha256": "acacaf13ae1b60c38c5c01b811f30c4951b1805674c79d5db7cda946cc389471"}, {"path": "_backends.py", "sha256": "ec10222967412cbbc08abc9f8700dbc318251835bd0e1e4534c4f51114aecf19"}, {"path": "_torch_specific.py", "sha256": "c8c6907aa0198412d647543e26feae4483497f344e84b6feaf328a7afa5e7d45"}, {"path": "array_api.py", "sha256": "8ce6fc461c0b4bdc286ff63f7bf2ab9c147a8a140fa01d8bcb4b5fac7afefd99"}, {"path": "einops.py", "sha256": "b17bc3f12585aae7f38b24092913e67c018754dd5c303bd838f36e67c2f55d05"}, {"path": "experimental\\__init__.py", "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}, {"path": "experimental\\indexing.py", "sha256": "c8515f956dfe915ebfe4f3c953bfe3389b090425825a513874696ef60c123d7a"}, {"path": "layers\\__init__.py", "sha256": "bc1b6702dd9a7ece1096aa5e154e1d95937106e0bd2179777e68a593ed8ecc73"}, {"path": "layers\\_einmix.py", "sha256": "90dc96d390441be9a2329bb5bc642a297afc38931efb1c1e4bf68c520b9eaea3"}, {"path": "layers\\flax.py", "sha256": "cc5cbcde048b466df570bb8a151bd9f36fc7b1e7e75cf6d1be42998752a40b52"}, {"path": "layers\\keras.py", "sha256": "fbb4a8d30f78a61bdff47756d318b6992781834daa54fbc0c9fa7fd57474d8d3"}, {"path": "layers\\oneflow.py", "sha256": "6043f3cf8c5cec10d141f6fcba50f7b5ea9025d6ceeaa420ed9e0a20f5532f3f"}, {"path": "layers\\paddle.py", "sha256": "f1c45943c053f6f60473387ba4d3eba2e4ccff75e32edcb686ddac76f5cd1622"}, {"path": "layers\\tensorflow.py", "sha256": "4fdba1495c1b5d111a85cdf5011007a0de4afbbcecb92f0d44d3dd63a664d417"}, {"path": "layers\\torch.py", "sha256": "e74e06f7d904832edd93550f05b8fd873266664007c1584c0c537ff09fa9dc2f"}, {"path": "packing.py", "sha256": "d7037dbcc6be728ab5462391fcdbb6697aa0224ac37f78fe37543e60dd3ec56a"}, {"path": "parsing.py", "sha256": "c5ba9cbf045e2e244e12e7287a0676d1642210794b834bb1a3fbd8a1ecca07fe"}, {"path": "tests\\__init__.py", "sha256": "08b2821af1530b0994a14c5f6be2461d040bf5ce37ad38aa89e9d58d3d7c3e17"}, {"path": "tests\\run_tests.py", "sha256": "57cabbfd8f5d324b272ecaa86ea3476d1d23f1d542be8d6139e07602343cdcda"}, {"path": "tests\\test_einsum.py", "sha256": "79f4bbca726fc08dd515f4f3a58aee5a72988715b2c5f47375b5ec3276451d63"}, {"path": "tests\\test_examples.py", "sha256": "a6c77ffc258e717d89e403d7c6c151bd79692a6f728a84d012711e6c44ad3ca7"}, {"path": "tests\\test_layers.py", "sha256": "a1055f5371b3b17abf749577664601246a7c12e98912d3d107479183aa5a2daf"}, {"path": "tests\\test_ops.py", "sha256": "a258f327637893be508d2b6168e011e24e7b8f4c812a3b92ac369cec9b991da9"}, {"path": "tests\\test_other.py", "sha256": "6a0fe1ea8cf780c1fc324778091e505d7c3d92679811e7d4686a1b5c48078cc3"}, {"path": "tests\\test_packing.py", "sha256": "3dd20ebc7af52bb778179b3532d080388ac892f027889070e709db9e90f1df19"}, {"path": "tests\\test_parsing.py", "sha256": "5ca1487b5d059696b98131359475de62dd462aba1791423e6f5f0f6adfee41e1"}]
for _row in _einops_bindings:
    with (_einops_dir / _row['path']).open('rb') as _stream:
        if hashlib.file_digest(_stream, 'sha256').hexdigest() != _row['sha256']:
            raise RuntimeError('Swin dependency differs from the verified installed package')
class _SwinDependencyFinder(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname == 'einops' and path is None:
            return importlib.machinery.PathFinder.find_spec(fullname, [str(_einops_dir.parent)])
        return None
sys.meta_path.insert(0, _SwinDependencyFinder())

_torch,_,_,_,_=_helper.runtime()
_torch.use_deterministic_algorithms(True)
_torch.backends.cudnn.benchmark=False
_torch.backends.cudnn.deterministic=True
_torch.backends.cudnn.allow_tf32=False
_torch.backends.cuda.matmul.allow_tf32=False
if not _torch.cuda.is_available(): raise RuntimeError('CUDA runtime unavailable')
"""Research inference using official MONAI BraTS 0.5.4 weights. No API calls."""
import argparse
import hashlib
import json
import sys
import time
import math
from pathlib import Path
import nibabel as nib
import numpy as np
import torch
from monai.inferers import sliding_window_inference
from monai.networks.nets import SegResNet, SwinUNETR
from monai.transforms import NormalizeIntensity

ORDER = ('t1c', 't1', 't2', 'flair')
REVISION = '370f7f9d062745fbac445e7fe6d6616d35df04ec'

def load_study(files, order=ORDER):
    images, arrays = [], []
    for name in order:
        image = nib.load(files[name])
        if len(image.shape) != 3 or any(d < 16 or d > 320 for d in image.shape) or np.prod(image.shape) > 25000000:
            raise ValueError('Each image set must be one 3D research volume, dimensions 16–320, with at most 25 million voxels.')
        if image.header.get_xyzt_units()[0] != 'mm':
            raise ValueError('Spatial units must be explicitly recorded in millimetres.')
        if not (int(image.header['sform_code']) > 0 or int(image.header['qform_code']) > 0):
            raise ValueError('A spatial transform must be recorded in the MRI header.')
        if not np.allclose(nib.affines.voxel_sizes(image.affine), [1, 1, 1], atol=0.01):
            raise ValueError('This model expects research images prepared at 1 mm spacing in all directions.')
        if images and (image.shape != images[0].shape or not np.allclose(image.affine, images[0].affine, atol=1e-3)):
            raise ValueError('The four image sets must share dimensions and alignment. No automatic registration is performed.')
        array = image.get_fdata(dtype=np.float32)
        if not np.isfinite(array).all() or not np.any(array != 0) or np.std(array[array != 0]) < 1e-6:
            raise ValueError('Image intensities are empty, constant, or non-finite.')
        images.append(image)
        arrays.append(array)
    return images[0], np.stack(arrays)

def run(job, weights, model_id='segresnet'):
    started = time.time()
    files = json.loads((job / 'input.json').read_text())
    if model_id != 'swinunetr':
        raise ValueError('Unknown imaging model.')
    swin = model_id == 'swinunetr'
    order = ('flair', 't1c', 't1', 't2') if swin else ORDER
    window = (128, 128, 128) if swin else (96, 96, 96)
    overlap = 0.6 if swin else 0.5
    image, arrays = load_study(files, order)
    torch.set_num_threads(2)
    model = (SwinUNETR(img_size=window, in_channels=4, out_channels=3, feature_size=48,
                       use_checkpoint=False) if swin else
             SegResNet(blocks_down=[1, 2, 2, 4], blocks_up=[1, 1, 1], init_filters=16,
                       in_channels=4, out_channels=3, dropout_prob=0.2))
    state = torch.load(weights, map_location='cpu', weights_only=True)
    if swin:
        state = state['state_dict']
    model.load_state_dict(state, strict=True)
    del state
    model.to("cuda").eval(); torch.cuda.reset_peak_memory_stats()
    normalized = NormalizeIntensity(nonzero=True, channel_wise=True)(arrays)
    tensor = torch.as_tensor(normalized, dtype=torch.float32).unsqueeze(0)
    total_windows = math.prod(math.ceil(max(0, d - w) / max(1, int(w * (1 - overlap)))) + 1
                              for d, w in zip(image.shape, window))
    completed_windows = 0
    def predict_window(window_tensor):
        nonlocal completed_windows
        output = model(window_tensor)
        completed_windows += 1
        (job / 'progress.json').write_text(json.dumps({'completedWindows': completed_windows,
                                                      'totalWindows': total_windows}))
        return output
    with torch.inference_mode():
        prediction = sliding_window_inference(tensor, roi_size=window, sw_batch_size=1,
                                              predictor=predict_window, overlap=overlap, mode='constant', sw_device='cuda', device='cpu')
        probabilities = torch.sigmoid(prediction[0]).numpy()
        regions = probabilities > 0.5 if swin else probabilities >= 0.5
    # Official bundle label priority: enhancing (4), core (1), whole-region remainder (2).
    mask = np.where(regions[2], 4, np.where(regions[0], 1, np.where(regions[1], 2, 0))).astype(np.uint8)
    header = image.header.copy()
    header.set_data_dtype(np.uint8)
    header.set_slope_inter(1, 0)
    if torch.cuda.max_memory_reserved()>3900000000: raise RuntimeError('GPU memory budget exceeded')
    nib.save(nib.Nifti1Image(mask, image.affine, header), job / 'mask.nii')
    voxel_ml = abs(np.linalg.det(image.affine[:3, :3])) / 1000
    counts = {'whole_region': int(np.count_nonzero(mask)),
              'core_region': int(np.count_nonzero((mask == 1) | (mask == 4))),
              'enhancing_region': int(np.count_nonzero(mask == 4))}
    result = {'model': 'MONAI Swin UNETR BraTS21' if swin else 'MONAI BraTS SegResNet',
              'modelId': model_id, 'version': 'fold0-f48-ep300' if swin else '0.5.4',
              'revision': 'MONAI-extra-test-data/0.8.1/fold0_f48_ep300_4gpu_dice0_8854' if swin else REVISION,
              'parameterCount': sum(p.numel() for p in model.parameters()),
              'weightsSha256': hashlib.sha256(weights.read_bytes()).hexdigest(),
              'runtime': {'torch': torch.__version__, 'device': 'CUDA', 'gpuName':torch.cuda.get_device_name(0), 'precision':'FP32', 'peakReservedGpuBytes':torch.cuda.max_memory_reserved(), 'monai': '1.4.0'},
              'durationSeconds': round(time.time() - started, 1), 'dimensions': list(image.shape),
              'inputSha256': {name: hashlib.sha256(Path(files[name]).read_bytes()).hexdigest() for name in order},
              'candidateRegionVolumesMl': {k: round(v * voxel_ml, 3) for k, v in counts.items()},
              'threshold': 0.5, 'inputOrder': list(order), 'window': list(window), 'overlap': overlap,
              'scope': 'Research glioma-region segmentation; not broad brain disease detection.',
              'limitations': ['No local medical accuracy validation has been performed.',
                             'GPU execution changes the processing device; it does not establish better medical accuracy.',
                             ('Uses the official Swin UNETR inference window and overlap; independent clinical validation remains necessary.' if swin else 'Uses smaller inference windows than the official bundle to limit memory. Results may differ.'),
                             'Agreement on a single public BraTS-derived case does not establish accuracy on unseen studies; training overlap is unverified.',
                             'Sequence identity, patient identity, skull stripping, and true anatomical alignment cannot be established from these checks.',
                             'Region markings and volumes are model candidates, not diagnoses or calibrated disease probabilities.',
                             'No marked region does not establish a healthy brain.'],
              'summary': 'Local model inference completed. Candidate markings require qualified review. Other conditions remain unassessed.'}
    (job / 'result.json').write_text(json.dumps(result, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--job', required=True, type=Path)
    parser.add_argument('--weights', required=True, type=Path)
    parser.add_argument('--model', choices=['segresnet', 'swinunetr'], default='segresnet')
    args = parser.parse_args()
    try:
        run(args.job, args.weights, args.model)
    except Exception as error:
        message = str(error) if isinstance(error, ValueError) else 'Model execution failed. Check memory, model files, and research input preparation.'
        (args.job / 'result.json').write_text(json.dumps({'error': message}))
        sys.exit(1)
