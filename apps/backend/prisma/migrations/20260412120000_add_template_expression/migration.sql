-- CreateEnum
CREATE TYPE "TemplateExpression" AS ENUM ('SMILING', 'NEUTRAL', 'ANY');

-- AlterTable
ALTER TABLE "style_templates" ADD COLUMN "expression" "TemplateExpression" NOT NULL DEFAULT 'ANY';

-- CreateIndex
CREATE INDEX "style_templates_expression_idx" ON "style_templates"("expression");
