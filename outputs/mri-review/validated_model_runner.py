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
from mri_validation import load_study, save_verified_mask, sha

ORDER = ('t1c', 't1', 't2', 'flair')
REVISION = '370f7f9d062745fbac445e7fe6d6616d35df04ec'

def run(job, weights, model_id='segresnet', device='cpu', runtime_provenance=None):
    started = time.time()
    if (job/'mask.nii').exists() or (job/'result.json').exists():
        raise ValueError('This run already has output. Create a new session; existing results are preserved.')
    if not weights.is_file():
        raise ValueError('The selected model checkpoint is missing. No inference was performed.')
    expected={'segresnet':'860ccb3f1c21c99d0410ad8a1ac4ef6b8fab60cec0a503b0ba42675741a750ae',
              'swinunetr':'cab715630f00ef6de1ad2ce48febcf69dad7abea5c401aa3d4ca798a8ffd1399'}
    if model_id not in expected or sha(weights)!=expected[model_id]:
        raise ValueError('The model checkpoint does not match the installed published-model identity. No inference was performed.')
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
    model.to(device).eval()
    normalized = NormalizeIntensity(nonzero=True, channel_wise=True)(arrays)
    if not np.isfinite(normalized).all():
        raise ValueError('Preprocessing produced invalid intensities.')
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
                                              predictor=predict_window, overlap=overlap, mode='constant', sw_device=device, device='cpu')
        if prediction.shape != (1,3,*image.shape) or not torch.isfinite(prediction).all():
            raise ValueError('Inference produced invalid prediction dimensions or non-finite values.')
        probabilities = torch.sigmoid(prediction[0]).numpy()
        regions = probabilities > 0.5 if swin else probabilities >= 0.5
    # Official bundle label priority: enhancing (4), core (1), whole-region remainder (2).
    mask = np.where(regions[2], 4, np.where(regions[0], 1, np.where(regions[1], 2, 0))).astype(np.uint8)
    spatial_validation = save_verified_mask(mask, image, job/'mask.nii')
    voxel_ml = abs(np.linalg.det(image.affine[:3, :3])) / 1000
    counts = {'whole_region': int(np.count_nonzero(mask)),
              'core_region': int(np.count_nonzero((mask == 1) | (mask == 4))),
              'enhancing_region': int(np.count_nonzero(mask == 4))}
    result = {'model': 'MONAI Swin UNETR BraTS21' if swin else 'MONAI BraTS SegResNet',
              'modelId': model_id, 'version': 'fold0-f48-ep300' if swin else '0.5.4',
              'revision': 'MONAI-extra-test-data/0.8.1/fold0_f48_ep300_4gpu_dice0_8854' if swin else REVISION,
              'parameterCount': sum(p.numel() for p in model.parameters()),
              'weightsSha256': hashlib.sha256(weights.read_bytes()).hexdigest(),
              'schemaVersion': 2, 'spatialValidation': spatial_validation,
              'preprocessing': {'normalization':'nonzero channel-wise z-score','resampling':False,'registration':False,'orientation':'prepared RAS required','officialConfiguration':'https://huggingface.co/MONAI/brats_mri_segmentation/blob/'+REVISION+'/configs/inference.json','officialSegResNetWindow':[240,240,160],'inferenceWindowAdaptation':not swin,'precision':'FP32'},
              'runnerSha256':sha(Path(__file__)), 'validationSha256':sha(Path(__file__).with_name('mri_validation.py')),
              'runtimeProvenance':runtime_provenance,
              'runtime': {'torch': torch.__version__, 'device': device.upper(), 'monai': '1.4.0'},
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
    with (job/'result.json').open('x') as stream:json.dump(result,stream,indent=2,allow_nan=False)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--job', required=True, type=Path)
    parser.add_argument('--weights', required=True, type=Path)
    parser.add_argument('--model', choices=['segresnet', 'swinunetr'], default='segresnet')
    args = parser.parse_args()
    try:
        run(args.job, args.weights, args.model)
    except Exception as error:
        message = str(error) if isinstance(error, ValueError) else f'Model execution failed ({type(error).__name__}). Check memory, model files, and research input preparation.'
        error_path=args.job/'error.json'
        if not error_path.exists():error_path.write_text(json.dumps({'error':message,'errorType':type(error).__name__}))
        sys.exit(1)
