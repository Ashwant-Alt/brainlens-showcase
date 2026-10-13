# Set up BrainLens locally

This is application **source code**, not a hosted service or a one-click diagnosis app. The source ZIP includes the website, server, MRI viewer, model adapters and software tests. It excludes MRI data, credentials, Python environments and model checkpoints. Missing models produce explicit unavailable states; there are no substitute predictions.

## 1. Download and extract

Download `BrainLens-program-source.zip` from this repository. Extract into a new dedicated folder, such as `D:\BrainLens-public`. Keep its `outputs\mri-review` directory structure intact: runtime lookup paths depend on it. Do not extract over an existing research installation.

## 2. Open the website

Install Node.js 22 from https://nodejs.org/ if it is not already available. In PowerShell:

```powershell
cd D:\BrainLens-public\outputs\mri-review
node --env-file-if-exists=.env server.mjs
```

Open http://127.0.0.1:3000 in your browser. There are no npm package dependencies to install. The interface and local NIfTI viewer can run without Python or an AI API key. Without checkpoints, model analysis remains unavailable.

`127.0.0.1` is your own computer, not a public link. Visitors cannot upload to someone else's local installation through GitHub. The app intentionally binds to localhost; it is not ready for public hosting with personal MRI data.

## 3. Optional Python CPU environment

For a **new installation only**, Python 3.12 is the documented runtime. The current Windows source looks for `work\ml-venv\Scripts\python.exe` relative to the extracted root. Create this environment only in your new folder; do not replace an existing environment.

```powershell
cd D:\BrainLens-public
py -3.12 -m venv work\ml-venv
& .\work\ml-venv\Scripts\python.exe -m pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu
& .\work\ml-venv\Scripts\python.exe -m pip install numpy==1.26.4 Pillow==12.3.0 nibabel==5.2.1 monai==1.4.0 einops==0.8.1
```

These commands download dependencies; they have not been executed as part of this source publication. This is the existing documented CPU dependency set, not a newly verified clean-machine installer. CUDA bootstrapping is specific to the original research computer; use `MRI_DEVICE=cpu` on a fresh installation. Native Linux/macOS Python paths require adapter changes and have not been verified.

## 4. Models are a separate requirement

### 2D category suggestions

You need an appropriately licensed, trusted BRISC-trained bundle containing `classifier.ts`, `bundle.json` and `evaluation.json`, with intact SHA256 bindings. It is **not included in this source archive**. BRISC is a dataset, not a downloadable checkpoint that automatically matches this application. Do not use random model files, synthetic test models, or alter hashes to bypass verification.

The adapter contract and exact RGB 224x224 preprocessing are in `outputs/mri-review/BRISC-RESEARCH.md`. This repository currently does not distribute a ready-to-run 2D checkpoint. Consequently new visitors can inspect the code and viewer, but cannot reproduce category predictions until a compatible model bundle is separately supplied and its redistribution conditions resolved.

For a trusted compatible bundle already available to you, create `.env` inside `outputs/mri-review`:

```dotenv
PORT=3000
MRI_DEVICE=cpu
MRI_JOBS_DIR=D:/BrainLens-public/local-results/3d
BRAINLENS_SLICE_JOBS_DIR=D:/BrainLens-public/local-results/2d
BRAINLENS_BRISC_BUNDLE=D:/YOUR-TRUSTED-MODEL/bundle.json
```

Use your own absolute paths. Never commit `.env`, uploads or saved results. Restart the server. The 2D page must report an available model before analysis is possible.

### 3D segmentation

The existing SegResNet adapter expects the official MONAI BraTS bundle 0.5.4 weights at `work/model-weights/model.pt` or `MRI_SEGRESNET_WEIGHTS`. Checkpoint SHA256: `860ccb3f1c21c99d0410ad8a1ac4ef6b8fab60cec0a503b0ba42675741a750ae`. Publisher: https://huggingface.co/MONAI/brats_mri_segmentation/tree/0.5.4 . Review its documentation and licence before separate acquisition. The source includes `MODEL-LICENSE.txt`; no checkpoint is downloaded automatically.

The local 96-cube production window is preserved. Inputs require four prepared, aligned, skull-stripped NIfTI-1 volumes: contrast T1, precontrast T1, T2 and FLAIR, with consistent RAS geometry and 1 mm spacing. The app does not perform automatic registration or skull stripping. CPU execution can be slow; no fresh-machine runtime or medical performance guarantee is implied.

The optional Swin adapter also needs its separate compatible checkpoint. Public-study loaders and historical report links require locally installed research files, deliberately excluded from this package; unavailable research links do not indicate bundled data.

## 5. Check the software

From `outputs/mri-review`:

```powershell
node --test --test-concurrency=1
& ..\..\work\ml-venv\Scripts\python.exe -B -m unittest test_mri_validation test_brisc_runner -v
```

Python checks need the environment above. The complete Node suite also includes integration checks that require the Python runtime and installed segmentation weights. Without these resources, run the source-only checks instead:

```powershell
$checks = Get-ChildItem *.test.mjs | Where-Object { $_.Name -notin @('brisc-service.test.mjs','model-service.test.mjs') } | ForEach-Object { $_.FullName }
node --test --test-concurrency=1 $checks
```

Synthetic fixtures exercise software behaviour; they are not MRI performance evidence. See `HOW-TO-USE.md` for the upload workflow and limitations.

## Existing original installation

The preserved `Start-BrainLens.ps1` is for the original D-drive research installation. Its default model and results paths are machine-specific. New visitors should use the direct server command and their own configuration above, rather than assuming those D-drive datasets exist.
