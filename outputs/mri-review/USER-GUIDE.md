# Your first MRI research review

Open the running website at [http://127.0.0.1:3000](http://127.0.0.1:3000). The easiest starting point is one of the eight prepared public research studies available in the app. You do not need your own MRI files or an NVIDIA API key to try local imaging.

The current website processes **one MRI examination at a time**. Comparing scans from two different dates is a future feature. Its markings are research output for review, not a diagnosis or a check for every brain condition.

Use the four step links near the top to jump to choosing a study, exploring images, running the model, or recording a review. Keyboard users can press Tab from the initial page to reveal **Skip to the workspace**, then Enter to move to the first step.

## Start with a public study

1. In **1. Choose a study**, choose a **Public study** and select **Load selected study**.
2. Wait for the message saying that all four image sets are loaded. Loading displays the images and fills in the model inputs. It does not run the model.
3. In **2. Explore the images**, use **Image set to view** to switch between T1 with contrast, T1 before contrast, T2, and FLAIR. Move **Slice** to look through the image stack. **View direction** changes which stored image direction you see.
4. In **3. Run the local imaging model**, choose an **Imaging model** and select **Run research model**. The readiness box explains anything still missing. Processing runs on this computer; leave the page open while it finishes.

**SegResNet** is the original baseline model. **Swin UNETR** is a larger model that usually takes longer on this computer's CPU. Earlier public-study runs here took under a minute for SegResNet and about 9–16 minutes for Swin; other studies or devices can take a different amount of time. A larger model is not a promise of better results. Both support a limited glioma-region research task. The website uses their official pretrained weights. Experimental training is separate and is not automatically added to the model selector.

## What the image controls mean

A **slice** is one thin section through a 3D stack. **Display contrast** changes how light and dark the image appears on your screen. It does not change the original data or the model's answer. It is different from a contrast agent given during an MRI examination.

Switching among the current study's image sets keeps your slice when their recorded dimensions and positions match. Model markings are shown only on an image with matching recorded geometry. Axis-aligned images have axial, coronal and sagittal directions derived from the recorded transform; oblique images use storage directions. Proportions follow recorded spacing. This cannot prove true anatomical alignment and is not for clinical interpretation. This is a slice viewer for a 3D volume, not a 3D surface renderer.

**Choose one 3D MRI file** opens a single-file preview. It does not fill all four model inputs. **Try a viewer sample** shows synthetic geometry so you can learn the controls; it is not a patient scan or a model accuracy test. Opening an independent preview clears the current model result and markings.

## Understand a completed result

Before displaying a completed result, the browser independently counts the downloaded markings and checks their dimensions and candidate volumes against the model report. A mismatch blocks the result. Passing this check means the files agree; it does not mean that the model's markings are medically correct.

In step 4, **Create local review draft** fills an editable summary with the checked measurements and limitations. No API key or external service is needed. Review the text, add observations and select **Append local draft to notes**. Existing notes are preserved. The downloaded review records the consistency checks and the summary's local origin.

After processing, **Show model candidate markings** turns the overlay on or off. The legend explains the colors. You can switch image sets without rerunning the model when their recorded geometry matches.

Select **Go to most marked slice** to open the slice containing the greatest number of model markings in your current view direction. The location panel also shows the first and last marked slices. All markings are retained, including small and disconnected areas. This is a way to explore candidate locations; the most marked slice does not mean greater disease confidence or severity. Review exports include these locations using zero-based file-storage indices; on-screen slice numbers start at one.

The result shows **whole**, **core**, and **enhancing** candidate region volumes in **millilitres (mL)**. Whole means all colored markings together; core means amber and pink together; enhancing means pink only. “Enhancing” is the name of the research annotation category the model learned. These are sizes of model markings. The regions overlap, so do not add the three numbers together. They are not confirmed tumor measurements, diagnostic probabilities, or evidence that a brain is healthy when no region is marked.

Read the listed limitations. **Model and run details** records which model and settings produced the result. **Download region markings (.nii)** saves the model's 3D marking file. The public-study comparison link opens a separate report showing agreement with expert reference markings. **Latest training comparison: five studies and error maps** opens the completed training experiment report, including every improvement and decrease against the earlier model. These reports do not change which models are installed in the website. Results from a few public studies do not establish performance on new patients.

The [project explanation](http://127.0.0.1:3000/about#postoperativeEvidence) also includes the newer,
separate V2 test on 21 postoperative scans. It improved 15 scans and worsened
six, with mean region overlap changing from 0.471 to 0.545. This is not a
diagnosis-accuracy percentage, a healthy-brain test or tumour-type recognition.
V2 has not been added to the website's model selector. Those 21 answers have
now been viewed, so future experiments using them are development comparisons.

## Use your own prepared research files

Use permitted, de-identified research data. Each input must be a `.nii` or `.nii.gz` file, no larger than 100 MB. NIfTI is a research format that stores a complete 3D image stack; `.gz` means compressed. Hospital DICOM files, photos, and screenshots cannot be used here.

Provide all four image techniques from **the same examination**:

- **T1 with contrast (T1c):** acquired after a contrast agent; prepared files may be labelled T1c, T1ce, or T1gd.
- **T1 before contrast (T1):** acquired before a contrast agent; the fluid around the brain generally looks dark.
- **T2:** a different technique in which that fluid generally looks bright.
- **FLAIR:** similar to T2, with much of that fluid signal reduced so it looks darker.

These are typical appearances, not a way to verify a file's sequence or decide whether an image shows disease. The website's **Why are there different image sets?** explanation links to [MRI sequence basics from Case Western Reserve University](https://case.edu/med/neurology/NR/MRI%20Basics.htm).

These are four image sets from one examination, not four dates. Do not duplicate a file to fill the inputs or mix studies.

The model expects aligned, skull-stripped research data at 1 mm spacing. “Skull-stripped” means tissue outside the brain has been removed during preparation. Supported inference inputs use RAS-aligned storage: the three recorded axes increase toward the person's right, front and top. Other orientations can be previewed but are rejected for inference rather than silently transformed. Use exactly 3D NIfTI-1 .nii or .nii.gz files with matching dimensions and transforms. DICOM, NIfTI-2, 4D, invalid intensities and inconsistent spatial headers are rejected. The app does not register, resample or remove tissue. Its checks cannot establish patient identity, sequence identity, actual anatomical alignment, or skull stripping.

Choose the four files, review the preparation requirements, and select the confirmation checkbox. The readiness box lists missing inputs or file problems. **Run research model** remains unavailable until the recorded file checks pass, the requirements are confirmed, and a local model is ready. The server performs further checks when processing starts.

## Keep a review and an optional text draft

In **4. Record your review**, write observations, uncertainty, and limitations. **Check wording locally** checks a few phrases in your browser; it does not check medical correctness. **Download review** saves your notes and the current run details as a JSON text file.

When you change the study, model, or model inputs, existing notes are retained and marked for review. Downloading is blocked until you select **These notes apply to this study** after reviewing them, or **Clear review notes**. This helps prevent attaching old notes to a new study.

**Optional NVIDIA summary draft** uses a separate language service to rewrite structured results. It does not analyze MRI, train the imaging model, or improve its accuracy. If configured and you explicitly select the consent checkbox, the app sends candidate volumes, model details, and fixed limitations to NVIDIA. MRI files, filenames, identifying information, reference answers, and your notes are excluded. The provider may reject a request because of account access or quota limits; local imaging still works.

Review and edit every draft before using it. Appending a draft preserves existing notes. **Save review locally** saves a new note version tied to the input checksums, model checkpoint and segmentation. **Refresh saved runs** and **Reopen saved run** restore completed results after a server restart without running the model again. Source and mask checksums and geometry are verified before reopening. **Clear displayed result** only clears the display; it preserves saved files. There is no automatic expiry deletion. Results use the existing local research storage on D; manage retention deliberately with a reviewed filesystem action. Never upload identifying or unauthorized research data.

The latest fixed-model refinement completed comparisons on 21 already viewed scans. Mean Dice moved from 0.545 to 0.558, with 11 improvements and ten declines; the first group worsened on average. Read the separate development table at http://127.0.0.1:3000/about#inferenceRefinementEvidence. These outline scores do not establish tumour-type diagnosis or healthy-brain accuracy, and the website's official models were not replaced.

A separate previously unused case completed predictions before its expert outline was obtained. Overlap was 0.532 for the original model, 0.466 for V2 control and 0.321 for the refinement. Its missing author timepoint metadata remains unresolved; it is excluded from the main benchmark and does not establish independent accuracy.

The focused training experiment finished three passes over the same forty training scans. On ten known validation scans, the selected third pass changed mean overlap from 0.642 to 0.674. On all 21 previously evaluated scans, it changed mean overlap only from 0.545 to 0.546: nine improved, twelve worsened, and eight had substantial declines. It failed the development checks and was not adopted. A separate check found that it completely missed six of thirty connected expert-outline pieces measuring at least 1 mL; V2 missed one. These pieces are parts of annotations, not confirmed individual tumours. Read the completed explanation at [the saved research results](http://127.0.0.1:3000/about#focusedTrainingEvidence). The website's installed models have not been replaced; these measurements do not establish tumour type, healthy-brain recognition or diagnostic accuracy.
