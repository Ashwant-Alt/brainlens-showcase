# What BrainLens does and how to use it

BrainLens helps explore brain MRI research outputs. It is not a diagnosis service.

## Upload one MRI image

1. Start the local app using `SETUP.md`. Open http://127.0.0.1:3000.
2. Choose **Upload an MRI image**, or open `/slice-research`.
3. Confirm the model is available. A missing model cannot generate a result.
4. Choose one permitted, de-identified **contrast-enhanced T1 brain MRI slice** as JPG or PNG, maximum 8 MB, 32–4096 pixels per side. A slice is one image from an MRI examination. Screenshots of arbitrary scans, T2/FLAIR, DICOM, WebP and NIfTI are not supported by this classifier.
5. Review the preview and confirm the required research-input declaration. The app cannot verify contrast status or anatomy from a filename.
6. Select **Analyze image** and wait for genuine local inference to complete.
7. Read **Suggested tumour category**: glioma, meningioma or pituitary tumour. Alternatively the page may show **No tumour category suggested in this slice**. Neither outcome is a confirmed diagnosis. Scores are uncalibrated model outputs.
8. Review the limitations and expandable details. **Whole-brain health stays inconclusive**. The 2D tumour outline is unavailable; classification does not generate boundaries.
9. Download the result or reopen a saved run using the page's controls. Results retain model/input provenance and are stored separately from the source image.

No-tumour category predictions can miss tumours or reflect a slice that does not show one. They do not establish a healthy brain. Dataset categories do not establish a pathology-confirmed tumour type.

## Explore a 3D MRI

1. Open the main MRI workspace and select a permitted NIfTI `.nii` or `.nii.gz` volume.
2. Use axial, coronal and sagittal controls to move through the volume.
3. Change display contrast to adjust brightness; this does not change source voxels.
4. For segmentation, supply all four required prepared sequences and complete the readiness checks. A single slice or unprepared examination cannot substitute for them.
5. With the matching SegResNet checkpoint installed, select **Run research model**.
6. Inspect the source image and separate candidate glioma-region overlay; review region volumes and limitations.
7. Save/reopen a verified result and edit/export review notes as available.

SegResNet localizes candidate glioma regions. It does not identify every brain disease, classify tumour categories, establish brain health or provide independently validated tumour-presence detection. The viewer shows 3D-volume slices, not a 3D surface render. Automatic registration, DICOM import and longitudinal comparison are not implemented.

## What a new visitor can expect

The website source and viewer are available in this repository. Live classification requires a separate compatible model bundle; it is not supplied here. GitHub itself does not run the website or analyse uploads. The demonstration shows one saved meningioma example matching its dataset label, not independent clinical validation. Experimental 2D outline weights remain offline.

Use only permitted, de-identified research data. Processing is local; optional NVIDIA text drafting is a separate consented language feature, not image interpretation. Do not publish private MRI scans or expose this localhost research server publicly without a separate privacy and security deployment review.
