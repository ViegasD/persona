import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('s3');

export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT || undefined,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  log.debug({ key, contentType }, 'Arquivo enviado ao S3');
  return key;
}

export async function getPresignedUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
    { expiresIn },
  );
  return url;
}

export async function getS3Object(key: string) {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
  );
  return response;
}

export async function deleteFile(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
  );
  log.debug({ key }, 'Arquivo removido do S3');
}

/**
 * Lista todas as chaves S3 sob um prefixo (suporta paginação automática).
 * Retorna array de chaves (strings), excluindo prefixos de subpasta.
 */
export async function listObjects(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: env.S3_BUCKET,
        Prefix: prefix.endsWith('/') ? prefix : `${prefix}/`,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of res.Contents ?? []) {
      if (obj.Key && obj.Key !== prefix) {
        keys.push(obj.Key);
      }
    }

    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

/**
 * Gera um key path para organizar arquivos por sessão.
 */
export function buildS3Key(
  sessionId: string,
  folder: 'references' | 'style-refs' | 'generated' | 'thumbnails',
  filename: string,
): string {
  return `sessions/${sessionId}/${folder}/${filename}`;
}
