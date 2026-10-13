import json, tempfile, unittest
from pathlib import Path
import nibabel as nib
import numpy as np
from mri_validation import load_volume,load_study,save_verified_mask,sha

class MRIContractTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
 def tearDown(self):self.temp.cleanup()
 def image(self,name='image.nii',shape=(16,17,18),affine=None,units='mm',constant=False):
  values=np.arange(np.prod(shape),dtype=np.float32).reshape(shape)%101 if not constant else np.ones(shape,dtype=np.float32)
  image=nib.Nifti1Image(values,np.eye(4) if affine is None else affine);image.header.set_xyzt_units(units)
  image.set_qform(image.affine,1);image.set_sform(image.affine,1)
  p=self.root/name;nib.save(image,p);return p
 def test_valid_compressed_and_uncompressed(self):
  for ext in ('nii','nii.gz'):
   image,values=load_volume(self.image('input.'+ext));self.assertEqual(image.shape,values.shape);self.assertTrue(np.isfinite(values).all())
 def test_endian_and_intensity_scaling(self):
  p=self.image();image=nib.load(p);h=image.header.as_byteswapped();h.set_data_dtype(np.int16);h.set_data_offset(352);h.set_slope_inter(2,3)
  original=np.arange(16*17*18,dtype=np.int16).reshape(16,17,18)
  path=self.root/'big.nii';path.write_bytes(h.binaryblock+b'\0'*4+original.astype('>i2').tobytes(order='F'))
  _,values=load_volume(path);np.testing.assert_array_equal(values,original.astype(np.float32)*2+3)
 def test_invalid_formats_and_truncation(self):
  for name,payload in [('image.dcm',b'bad'),('image.nii',b'bad'),('image.nii.gz',b'bad')]:
   p=self.root/name;p.write_bytes(payload)
   with self.subTest(name=name),self.assertRaises(ValueError):load_volume(p)
  p=self.image('truncated.nii');p.write_bytes(p.read_bytes()[:400])
  with self.assertRaisesRegex(ValueError,'Truncated'):load_volume(p)
 def test_nifti2_and_four_dimensions_rejected(self):
  p=self.root/'v2.nii';nib.save(nib.Nifti2Image(np.zeros((16,16,16)),np.eye(4)),p)
  with self.assertRaises(ValueError):load_volume(p)
  with self.assertRaisesRegex(ValueError,'3D'):load_volume(self.image('four.nii',shape=(16,16,16,1)))
 def test_invalid_values_and_constant(self):
  with self.assertRaisesRegex(ValueError,'constant'):load_volume(self.image(constant=True))
  for value in (np.nan,np.inf):
   p=self.image('nonfinite.nii');image=nib.load(p);data=image.get_fdata();data[1,2,3]=value;nib.save(nib.Nifti1Image(data,image.affine,image.header),p)
   with self.subTest(value=value),self.assertRaisesRegex(ValueError,'non-finite'):load_volume(p)
 def test_units_spacing_orientation_and_shear(self):
  with self.assertRaisesRegex(ValueError,'millimetres'):load_volume(self.image(units='meter'))
  for diagonal in ([2,1,1,1],[-1,1,1,1]):
   with self.subTest(diagonal=diagonal),self.assertRaises(ValueError):load_volume(self.image(affine=np.diag(diagonal)))
  a=np.eye(4);a[0,1]=.1
  with self.assertRaises(ValueError):load_volume(self.image(affine=a))
 def test_conflicting_forms_and_singular_affine(self):
  p=self.image();original=nib.load(p);image=nib.Nifti1Image(original.get_fdata(),original.affine,original.header);q=np.eye(4);q[0,3]=3;image.set_qform(q,1);nib.save(image,p)
  with self.assertRaisesRegex(ValueError,'disagree'):load_volume(p)
  p=self.image('singular.nii');raw=bytearray(p.read_bytes());raw[280:284]=b'\0'*4;p.write_bytes(raw)
  with self.assertRaisesRegex(ValueError,'singular'):load_volume(p)
 def test_exact_sequence_requirements_and_alignment(self):
  files={name:str(self.image(name+'.nii')) for name in ('t1c','t1','t2','flair')}
  image,arrays=load_study(files);self.assertEqual(arrays.shape,(4,*image.shape))
  for bad in ({'t1':files['t1']},{**files,'seg':files['t1']}):
   with self.assertRaisesRegex(ValueError,'Exactly'):load_study(bad)
  a=np.eye(4);a[0,3]=4;files['t2']=str(self.image('shifted.nii',affine=a))
  with self.assertRaisesRegex(ValueError,'alignment'):load_study(files)
 def test_saved_mask_coordinates_labels_and_no_overwrite(self):
  a=np.eye(4);a[:3,3]=[13,-8,21];p=self.image(affine=a);before=sha(p);image,_=load_volume(p)
  mask=np.zeros(image.shape,dtype=np.uint8);mask[2,3,4]=4;mask[7,8,9]=1;mask[8,9,10]=2
  result=save_verified_mask(mask,image,self.root/'mask.nii');self.assertEqual(result['cornerMaxErrorMm'],0);self.assertEqual(result['labels'],[0,1,2,4]);self.assertEqual(sha(p),before)
  with self.assertRaisesRegex(ValueError,'already exists'):save_verified_mask(mask,image,self.root/'mask.nii')
  with self.assertRaisesRegex(ValueError,'dimensions or labels'):save_verified_mask(np.full(image.shape,3),image,self.root/'bad.nii')
 def test_publisher_normalization_matches(self):
  from monai.transforms import Compose,LoadImaged,NormalizeIntensityd,NormalizeIntensity
  files={name:str(self.image(name+'.nii.gz')) for name in ('t1c','t1','t2','flair')}
  _,arrays=load_study(files)
  documented=Compose([LoadImaged(keys='image',image_only=False),NormalizeIntensityd(keys='image',nonzero=True,channel_wise=True)])({'image':[files[n] for n in ('t1c','t1','t2','flair')]})['image']
  actual=NormalizeIntensity(nonzero=True,channel_wise=True)(arrays)
  np.testing.assert_array_equal(np.asarray(documented),np.asarray(actual))
 def test_missing_or_wrong_checkpoint_is_explicit(self):
  from validated_model_runner import run
  with self.assertRaisesRegex(ValueError,'missing'):run(self.root,self.root/'missing.pt')
  wrong=self.root/'wrong.pt';wrong.write_bytes(b'not a model')
  with self.assertRaisesRegex(ValueError,'identity'):run(self.root,wrong)
  self.assertFalse((self.root/'mask.nii').exists());self.assertFalse((self.root/'result.json').exists())

if __name__=='__main__':unittest.main()
