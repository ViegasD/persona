-- CreateTable
CREATE TABLE "occasions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "prompt_hint" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "occasions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_templates" (
    "id" TEXT NOT NULL,
    "occasion_id" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "scene_prompt" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "style_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "occasions_slug_key" ON "occasions"("slug");

-- CreateIndex
CREATE INDEX "occasions_slug_idx" ON "occasions"("slug");

-- CreateIndex
CREATE INDEX "occasions_is_active_idx" ON "occasions"("is_active");

-- CreateIndex
CREATE INDEX "style_templates_occasion_id_idx" ON "style_templates"("occasion_id");

-- CreateIndex
CREATE INDEX "style_templates_is_active_idx" ON "style_templates"("is_active");

-- AddForeignKey
ALTER TABLE "style_templates" ADD CONSTRAINT "style_templates_occasion_id_fkey" FOREIGN KEY ("occasion_id") REFERENCES "occasions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
