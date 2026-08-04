-- CreateTable
CREATE TABLE "overtime" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "duration_hours" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approved_by_id" INTEGER,
    "approved_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "overtime_user_id_idx" ON "overtime"("user_id");
CREATE INDEX "overtime_date_idx" ON "overtime"("date");
CREATE INDEX "overtime_status_idx" ON "overtime"("status");
CREATE INDEX "overtime_user_id_status_idx" ON "overtime"("user_id", "status");
CREATE INDEX "overtime_created_at_idx" ON "overtime"("created_at");

-- AddForeignKey
ALTER TABLE "overtime" ADD CONSTRAINT "overtime_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "overtime" ADD CONSTRAINT "overtime_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;