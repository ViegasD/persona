-- CreateEnum
CREATE TYPE "GenerationJobType" AS ENUM ('IMAGE', 'VIDEO');

-- AlterTable: GenerationJob — rename kieJobId → externalJobId, add jobType
ALTER TABLE "generation_jobs" RENAME COLUMN "kie_job_id" TO "external_job_id";
ALTER TABLE "generation_jobs" ADD COLUMN "job_type" "GenerationJobType" NOT NULL DEFAULT 'IMAGE';

-- Drop old index and create new one
DROP INDEX IF EXISTS "generation_jobs_kie_job_id_idx";
CREATE INDEX "generation_jobs_external_job_id_idx" ON "generation_jobs"("external_job_id");

-- AlterTable: Delivery — add videosDelivered
ALTER TABLE "deliveries" ADD COLUMN "videos_delivered" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: Character
CREATE TABLE "characters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail_s3_key" TEXT,
    "reference_image_s3_keys" JSONB NOT NULL DEFAULT '[]',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gender" TEXT,
    "age_range" TEXT,
    "personality" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable: GeneratedVideo
CREATE TABLE "generated_videos" (
    "id" TEXT NOT NULL,
    "generation_job_id" TEXT NOT NULL,
    "lead_session_id" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "s3_url" TEXT NOT NULL,
    "thumbnail_s3_key" TEXT,
    "duration_seconds" INTEGER,
    "aspect_ratio" TEXT,
    "resolution" TEXT,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "characters_slug_key" ON "characters"("slug");
CREATE INDEX "characters_slug_idx" ON "characters"("slug");
CREATE INDEX "characters_is_active_idx" ON "characters"("is_active");
CREATE INDEX "generated_videos_lead_session_id_idx" ON "generated_videos"("lead_session_id");
CREATE INDEX "generated_videos_generation_job_id_idx" ON "generated_videos"("generation_job_id");

-- AddForeignKey
ALTER TABLE "generated_videos" ADD CONSTRAINT "generated_videos_generation_job_id_fkey" FOREIGN KEY ("generation_job_id") REFERENCES "generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generated_videos" ADD CONSTRAINT "generated_videos_lead_session_id_fkey" FOREIGN KEY ("lead_session_id") REFERENCES "lead_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
