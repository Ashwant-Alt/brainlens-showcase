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
    if model_id not in ('segresnet', 'swinunetr'):
        raise ValueError('Unknown imaging model.')
    swin = model_id == 'swinunetr'
    order = ('flair', 't1c', 't1', 't2') if swin else ORDER
    window = (128, 128, 128) if swin else (96, 96, 96)
    overlap = 0.6 if swin else 0.5
    image, arrays = load_study(files, order)
    torch.set_num_threads(min(8, torch.get_num_threads()))
    model = (SwinUNETR(img_size=window, in_channels=4, out_channels=3, feature_size=48,
                       use_checkpoint=False) if swin else
             SegResNet(blocks_down=[1, 2, 2, 4], blocks_up=[1, 1, 1], init_filters=16,
                       in_channels=4, out_channels=3, dropout_prob=0.2))
    state = torch.load(weights, map_location='cpu', weights_only=True)
    if swin:
        state = state['state_dict']
    model.load_state_dict(state, strict=True)
    del state
    model.eval()
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
                                              predictor=predict_window, overlap=overlap, mode='constant')
        probabilities = torch.sigmoid(prediction[0]).numpy()
        regions = probabilities > 0.5 if swin else probabilities >= 0.5
    # Official bundle label priority: enhancing (4), core (1), whole-region remainder (2).
    mask = np.where(regions[2], 4, np.where(regions[0], 1, np.where(regions[1], 2, 0))).astype(np.uint8)
    header = image.header.copy()
    header.set_data_dtype(np.uint8)
    header.set_slope_inter(1, 0)
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
              'runtime': {'torch': torch.__version__, 'device': 'CPU', 'monai': '1.4.0'},
              'durationSeconds': round(time.time() - started, 1), 'dimensions': list(image.shape),
              'inputSha256': {name: hashlib.sha256(Path(files[name]).read_bytes()).hexdigest() for name in order},
              'candidateRegionVolumesMl': {k: round(v * voxel_ml, 3) for k, v in counts.items()},
              'threshold': 0.5, 'inputOrder': list(order), 'window': list(window), 'overlap': overlap,
              'scope': 'Research glioma-region segmentation; not broad brain disease detection.',
              'limitations': ['No local medical accuracy validation has been performed.',
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
