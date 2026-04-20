/*
  Warnings:

  - Added the required column `crdt` to the `CanvasObject` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CanvasObject" ADD COLUMN     "crdt" JSONB NOT NULL;
