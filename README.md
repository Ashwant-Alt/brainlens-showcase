# BrainLens

I’ve been building BrainLens to bring a few brain MRI research workflows into one place. You can explore a supported 2D slice, look through a 3D scan, and review the model outputs the app can currently produce.

**[Browse the application source](https://github.com/Ashwant-Alt/brainlens-showcase/tree/main/outputs/mri-review)** · **[Setup guide](SETUP.md)** · **[How to use BrainLens](HOW-TO-USE.md)**

## See it running

https://github.com/user-attachments/assets/e9c3cf61-a31c-4d63-b3dd-cc0945e4ae6b

The example shows BrainLens suggesting **meningioma**, which matches the label recorded for that sample. It’s one slice and one match, so it doesn’t tell us how well the model will work on other images.

## What you can explore

- **2D slice suggestions:** With a compatible model installed, BrainLens can suggest glioma, meningioma, pituitary tumour, or the dataset’s “no tumour” category for a supported image.
- **3D scan viewer:** Open a supported NIfTI volume and move through axial, coronal, and sagittal views.
- **Candidate glioma regions:** For compatible, prepared four-sequence scans, the separate SegResNet workflow can show candidate regions and volume measurements.
- **Review tools:** Save results, reopen them, add notes, and export a review.

The experimental 2D outline model is currently offline while it is improved. BrainLens does not provide a whole-examination tumour diagnosis or determine that a brain is healthy.

## Trying it on your computer

1. Clone this repository to your computer.
2. Follow the [setup guide](SETUP.md) to start the local website.
3. Follow [How to use BrainLens](HOW-TO-USE.md) to explore the viewer and review workflow.

The source files are listed individually in this repository. MRI data, Python environments, and trained model checkpoints are separate requirements. The site and viewer can start without those files, but model-based features need separately configured, trusted model files. The 2D checkpoint is not included, so a new user cannot reproduce the category suggestion in the video straight from this repository. BrainLens also has no public upload service; it runs locally.

## A note on the research

BrainLens is a research project, not a diagnostic tool. Its 2D suggestions apply to an uploaded slice; they do not establish what is happening across a complete MRI examination. A “no tumour” slice result does not mean the brain is healthy.

Testing has found missed tumour-labelled cases and inconsistent segmentation. The model scores are uncalibrated, and independent patient-level diagnostic validation has not been established. I’m sharing the project with those limitations in view.

On the original development computer, the source-only checks passed 67 tests. A clean-computer setup and the complete model-dependent test suite have not been verified.

For image, model, and narration acknowledgements, see [CREDITS.md](CREDITS.md). Third-party licences still apply to their respective materials; publishing this source does not replace those licences.
