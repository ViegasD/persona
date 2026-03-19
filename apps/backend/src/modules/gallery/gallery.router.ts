import type { FastifyInstance } from 'fastify';
import {
  handleGetGallery,
  handleApproveImages,
  handleGetGalleryStatus,
} from './gallery.controller.js';

export async function galleryRouter(app: FastifyInstance): Promise<void> {
  app.get('/:token', handleGetGallery);
  app.post('/:token/approve', handleApproveImages);
  app.get('/:token/status', handleGetGalleryStatus);
}
