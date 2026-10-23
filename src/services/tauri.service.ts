import { focusLensService } from './focusLensService.ts';
import { cvService } from './cv.service.ts';

export const tauriService = {
  camera: focusLensService.camera,
  cv: cvService,
};

