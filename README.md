# BrainLens

A local brain MRI research application with a clear upload-and-review workflow.

**[Download the application source](https://github.com/Ashwant-Alt/brainlens-showcase/raw/refs/heads/main/BrainLens-program-source.zip)** · **[Set it up](SETUP.md)** · **[How to use it](HOW-TO-USE.md)**

## Watch the demonstration

https://github.com/user-attachments/assets/e9c3cf61-a31c-4d63-b3dd-cc0945e4ae6b

[Download the video directly](https://github.com/Ashwant-Alt/brainlens-showcase/raw/refs/heads/main/BrainLens-demo.mp4) if your browser cannot play the embedded version. The video shows a saved **meningioma** suggestion matching the example's dataset label. One match does not establish general accuracy.

## What can it do?

| Feature | What to expect |
| --- | --- |
| 2D MRI slice classification | With a separately installed compatible model, suggests glioma, meningioma, pituitary tumour or the no-tumour dataset category for one supported slice. |
| 3D MRI viewer | Opens supported NIfTI volumes and shows axial, coronal and sagittal slices. |
| 3D research segmentation | With compatible prepared four-sequence inputs and SegResNet weights, displays candidate glioma-region overlays and measured volumes. |
| Review | Supports saved results, reopening, editable review notes and exports. |
| 2D tumour outline | Unavailable; the experimental outline candidate remains offline. |
| Whole-examination diagnosis or healthy-brain determination | Unsupported; results cannot establish either. |

## Start here

1. Download and extract **BrainLens-program-source.zip** into a new folder.
2. Follow **[SETUP.md](SETUP.md)** to start the local website.
3. Open **http://127.0.0.1:3000** on the same computer.
4. For a supported JPG/PNG research slice, choose **Upload an MRI image**.
5. Once a compatible model is installed and shown as available, upload the image, confirm the input requirements and select **Analyze image**.
6. Read the suggested category and limitations. Use **[HOW-TO-USE.md](HOW-TO-USE.md)** for the detailed 2D and 3D workflows.

**Important setup limit:** the archive contains application source, not MRI datasets, Python environments or trained checkpoints. The interface and viewer can start without model assets. Classification and segmentation need their separately configured, trusted model files. This repository does not yet supply the 2D checkpoint, so a fresh visitor cannot immediately reproduce the demonstrated category prediction. GitHub does not host a live upload service.

## Package verification

The archive contains 64 unchanged application files, setup/use instructions and a source checksum manifest. Size: 175,732 bytes. SHA256: `3474d1520d8219abe831293fe2a65fe5e36b6320fdd21160ce5f0dd3ebcdc072`.

The packaged source passed **67 source-only Node checks** on the existing Windows computer. The initial complete suite had five failures: missing Python/model assets prevented four integration checks; an omitted public evidence CSV caused the fifth. The CSV was then included, and its navigation check passed in the 67-check run. The complete installed-model suite and a clean-machine installation were not rerun or verified for this release. No new medical inference was performed.

## Research scope

BrainLens is a research prototype. Suggestions are not confirmed diagnoses. A negative slice prediction does not establish a healthy brain. Scores are uncalibrated; independent patient-level diagnostic validation has not been established. Use permitted, de-identified research data only.

See **[CREDITS.md](CREDITS.md)** for imagery, model and narration attribution. The source publication does not grant a new blanket licence for third-party components. Original local research files, models and the working application were preserved.
