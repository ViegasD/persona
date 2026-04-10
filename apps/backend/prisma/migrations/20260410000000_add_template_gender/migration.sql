-- CreateEnum
CREATE TYPE "TemplateGender" AS ENUM ('MALE', 'FEMALE', 'UNISEX');

-- AlterTable
ALTER TABLE "style_templates" ADD COLUMN "gender" "TemplateGender" NOT NULL DEFAULT 'UNISEX';

-- CreateIndex
CREATE INDEX "style_templates_gender_idx" ON "style_templates"("gender");
