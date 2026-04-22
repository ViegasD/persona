import { prisma } from '../../shared/database/prisma.js';
import { uploadFile, buildS3Key, getPresignedUrl } from '../../shared/storage/s3.client.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { veo } from './veo.client.js';
import { randomUUID } from 'crypto';

const log = createChildLogger('video-result-processor');

interface VideoResult {
  videoUri: string;
  durationSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
}

/**
 * Downloads generated videos from Veo (Gemini File API URIs) and stores
 * them in S3.
 */
export async function processGeneratedVideos(
  videos: VideoResult[],
  generationJobId: string,
  leadSessionId: string,
): Promise<string[]> {
  const videoIds: string[] = [];

  for (let i = 0; i < videos.length; i++) {
    const { videoUri, durationSeconds, aspectRatio, resolution } = videos[i];
    try {
      const buffer = await veo.downloadVideo(videoUri);
      const filename = `${randomUUID()}.mp4`;

      const s3Key = buildS3Key(leadSessionId, 'videos', filename);
      await uploadFile(s3Key, buffer, 'video/mp4');

      const video = await prisma.generatedVideo.create({
        data: {
          generationJobId,
          leadSessionId,
          s3Key,
          s3Url: videoUri,
          thumbnailS3Key: null,
          durationSeconds: durationSeconds ?? null,
          aspectRatio: aspectRatio ?? null,
          resolution: resolution ?? null,
          isApproved: false,
          sequence: i + 1,
        },
      });

      videoIds.push(video.id);
      log.debug({ videoId: video.id, sequence: i + 1, durationSeconds }, 'Video processed');
    } catch (error) {
      log.error({ uri: videoUri, error }, 'Error processing individual video');
    }
  }

  log.info({ count: videoIds.length, generationJobId }, 'Video batch processed');
  return videoIds;
}

/**
 * Gets presigned URLs for all videos in a session.
 */
export async function getVideoPresignedUrls(
  leadSessionId: string,
): Promise<Array<{ id: string; url: string; thumbnailUrl: string | null; sequence: number; isApproved: boolean; durationSeconds: number | null; aspectRatio: string | null }>> {
  const videos = await prisma.generatedVideo.findMany({
    where: { leadSessionId },
    orderBy: { sequence: 'asc' },
  });

  return Promise.all(
    videos.map(async (vid) => ({
      id: vid.id,
      url: await getPresignedUrl(vid.s3Key),
      thumbnailUrl: vid.thumbnailS3Key
        ? await getPresignedUrl(vid.thumbnailS3Key)
        : null,
      sequence: vid.sequence,
      isApproved: vid.isApproved,
      durationSeconds: vid.durationSeconds,
      aspectRatio: vid.aspectRatio,
    })),
  );
}
