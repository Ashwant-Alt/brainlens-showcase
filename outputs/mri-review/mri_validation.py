"""Strict prepared-study contract. No registration, resampling or tissue removal."""
import gzip
import hashlib
import itertools
import struct
from pathlib import Path
import nibabel as nib
import numpy as np

SEQUENCES=('t1c','t1','t2','flair')
MAX_EXPANDED=180*1024*1024
DTYPES={2:8,4:16,8:32,16:32,64:64,256:8,512:16,768:32}

def sha(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def load_volume(filename):
    path=Path(filename)
    if not path.name.lower().endswith(('.nii','.nii.gz')):raise ValueError('Only single-file NIfTI-1 .nii or .nii.gz is supported; DICOM and NIfTI-2 are unsupported.')
    if not path.is_file():raise ValueError('An input image file is missing.')
    if path.stat().st_size>100*1024*1024:raise ValueError('Input exceeds 100 MB.')
    opener=gzip.open if path.name.lower().endswith('.gz') else open
    try:
        with opener(path,'rb') as stream:raw=stream.read(MAX_EXPANDED+1)
    except (OSError,EOFError) as exc:raise ValueError('Invalid or damaged compressed NIfTI file.') from exc
    if len(raw)>MAX_EXPANDED:raise ValueError('Expanded volume exceeds 180 MB.')
    if len(raw)<352:raise ValueError('Truncated NIfTI-1 header.')
    endian='<' if struct.unpack_from('<i',raw)[0]==348 else '>'
    if struct.unpack_from(endian+'i',raw)[0]!=348 or raw[344:348]!=b'n+1\0':raise ValueError('Only single-file NIfTI-1 is supported.')
    rank=struct.unpack_from(endian+'h',raw,40)[0]
    shape=struct.unpack_from(endian+'3h',raw,42)
    if rank!=3 or any(d<16 or d>320 for d in shape) or np.prod(shape)>25000000:raise ValueError('Use exactly one 3D volume, dimensions 16–320, at most 25 million voxels; 4D inputs are unsupported.')
    datatype,bits=struct.unpack_from(endian+'2h',raw,70)
    offset=struct.unpack_from(endian+'f',raw,108)[0]
    if datatype not in DTYPES or bits!=DTYPES[datatype]:raise ValueError('Unsupported or inconsistent voxel datatype.')
    if not np.isfinite(offset) or offset<352 or offset%1 or offset+int(np.prod(shape))*bits//8>len(raw):raise ValueError('Truncated voxel data or invalid voxel offset.')
    slope,intercept=struct.unpack_from(endian+'2f',raw,112)
    if not np.isfinite(slope) or (slope!=0 and not np.isfinite(intercept)):raise ValueError('Invalid intensity scaling.')
    try:image=nib.Nifti1Image.from_bytes(raw)
    except Exception as exc:raise ValueError('Invalid NIfTI-1 image.') from exc
    if image.header.get_xyzt_units()[0]!='mm':raise ValueError('Spatial units must be explicitly recorded in millimetres.')
    qcode,scode=int(image.header['qform_code']),int(image.header['sform_code'])
    if qcode not in range(6) or scode not in range(6) or not(qcode or scode):raise ValueError('A valid recorded spatial transform is required.')
    try:
        q=image.get_qform() if qcode else None
        s=image.get_sform() if scode else None
    except Exception as exc:raise ValueError('Invalid recorded spatial transform.') from exc
    for matrix in (q,s):
        if matrix is not None and (not np.isfinite(matrix).all() or abs(np.linalg.det(matrix[:3,:3]))<1e-8):raise ValueError('Non-finite or singular spatial transform.')
    if q is not None and s is not None and not np.allclose(q,s,rtol=0,atol=1e-3):raise ValueError('The recorded qform and sform disagree; resolve the spatial metadata before inference.')
    spacing=nib.affines.voxel_sizes(image.affine)
    header_spacing=np.array(struct.unpack_from(endian+'3f',raw,80))
    if not np.isfinite(header_spacing).all() or np.any(header_spacing<=0) or not np.allclose(header_spacing,spacing,rtol=0,atol=.01):raise ValueError('Header spacing and recorded affine spacing disagree.')
    if not np.allclose(spacing,[1,1,1],rtol=0,atol=.01):raise ValueError('This model requires prepared images at 1 mm spacing in every direction.')
    # Supported samples use RAS storage. Reject other layouts rather than infer on
    # a flipped/permuted array with an unvalidated change to the learned input.
    if not np.allclose(image.affine[:3,:3],np.diag(spacing),rtol=0,atol=1e-4):raise ValueError('Inference requires prepared RAS-aligned images; oblique, sheared or differently oriented grids are unsupported. Preview remains available.')
    values=image.get_fdata(dtype=np.float32)
    if not np.isfinite(values).all() or not np.any(values!=0) or np.std(values[values!=0],dtype=np.float64)<1e-6:raise ValueError('Image intensities are empty, constant, or non-finite.')
    return image,values

def load_study(files,order=SEQUENCES):
    if not isinstance(files,dict) or set(files)!=set(SEQUENCES):raise ValueError('Exactly T1c, T1, T2 and FLAIR from one prepared examination are required.')
    images=[];arrays=[]
    for name in order:
        image,values=load_volume(files[name])
        if images and (image.shape!=images[0].shape or not np.allclose(image.affine,images[0].affine,rtol=0,atol=1e-3)):raise ValueError('The four image sets must share dimensions and affine alignment. No automatic registration is performed.')
        images.append(image);arrays.append(values)
    return images[0],np.stack(arrays)

def save_verified_mask(mask,image,path):
    if mask.shape!=image.shape or not np.isin(mask,[0,1,2,4]).all():raise ValueError('Prediction dimensions or labels are invalid.')
    if Path(path).exists():raise ValueError('A prediction already exists; use a new run directory.')
    header=image.header.copy();header.set_data_dtype(np.uint8);header.set_slope_inter(1,0)
    prediction=nib.Nifti1Image(mask.astype(np.uint8),image.affine,header)
    prediction.set_qform(image.get_qform(),int(image.header['qform_code']))
    prediction.set_sform(image.get_sform(),int(image.header['sform_code']))
    nib.save(prediction,path)
    saved=nib.load(path)
    corners=np.array(list(itertools.product(*[(0,d-1) for d in image.shape])))
    source_world=nib.affines.apply_affine(image.affine,corners)
    output_world=nib.affines.apply_affine(saved.affine,corners)
    error=float(np.max(np.abs(source_world-output_world)))
    if saved.shape!=image.shape or saved.header.get_xyzt_units()[0]!='mm' or not np.allclose(saved.affine,image.affine,rtol=0,atol=1e-5) or error>1e-3 or not np.array_equal(saved.get_fdata(),mask):raise ValueError('Saved segmentation failed physical-coordinate or voxel-value verification.')
    return {'verified':True,'affine':saved.affine.tolist(),'orientation':list(nib.aff2axcodes(saved.affine)),
            'voxelSpacingMm':nib.affines.voxel_sizes(saved.affine).tolist(),'qformCode':int(saved.header['qform_code']),
            'sformCode':int(saved.header['sform_code']),'labels':np.unique(mask).tolist(),'cornerMaxErrorMm':error,
            'sourceArrayUnmodified':True,'maskSHA256':sha(path)}
