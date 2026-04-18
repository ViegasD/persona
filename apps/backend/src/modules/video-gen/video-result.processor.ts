import { prisma } from '../../shared/database/prisma.js';
import { uploadFile, buildS3Key, getPresignedUrl } from '../../shared/storage/s3.client.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { randomUUID } from 'crypto';

const log = createChildLogger('video-result-processor');

interface VideoResult {
  videoUrl: string;
  durationSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
}

/**
 * Downloads generated videos from xAI temporary URLs and stores them in S3.
 */
export async function processGeneratedVideos(
  videos: VideoResult[],
  generationJobId: string,
  leadSessionId: string,
): Promise<string[]> {
  const videoIds: string[] = [];

  for (let i = 0; i < videos.length; i++) {
    const { videoUrl, durationSeconds, aspectRatio, resolution } = videos[i];
    try {
      // Download video from xAI CDN
      const response = await fetch(videoUrl);
      if (!response.ok) {
        log.error({ url: videoUrl, status: response.status }, 'Failed to download generated video');
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const filename = `${randomUUID()}.mp4`;

      // Upload to S3
      const s3Key = buildS3Key(leadSessionId, 'videos', filename);
      await uploadFile(s3Key, buffer, 'video/mp4');

      // Create DB record
      const video = await prisma.generatedVideo.create({
        data: {
          generationJobId,
          leadSessionId,
          s3Key,
          s3Url: videoUrl,
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
      log.error({ url: videoUrl, error }, 'Error processing individual video');
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
