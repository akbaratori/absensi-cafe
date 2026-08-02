-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email" TEXT,
    "full_name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "employee_id" TEXT,
    "shift_id" INTEGER,
    "department" TEXT NOT NULL DEFAULT 'BAR',
    "off_day" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "hourly_rate" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "clock_in" TIMESTAMP(3) NOT NULL,
    "clock_out" TIMESTAMP(3),
    "clock_in_location" TEXT,
    "clock_out_location" TEXT,
    "clock_in_photo" TEXT,
    "clock_out_photo" TEXT,
    "clock_in_ip" TEXT,
    "clock_out_ip" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaves" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SICK',
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "proof" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "link" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_swaps" (
    "id" SERIAL NOT NULL,
    "requester_id" INTEGER NOT NULL,
    "target_user_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_USER',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_swaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "off_day_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "target_user_id" INTEGER,
    "off_date" TIMESTAMP(3) NOT NULL,
    "work_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "off_day_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_schedules" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "shift_id" INTEGER,
    "is_off_day" BOOLEAN NOT NULL DEFAULT false,
    "kitchen_station" TEXT,
    "is_inventory_controller" BOOLEAN NOT NULL DEFAULT false,
    "is_shift_pic" BOOLEAN NOT NULL DEFAULT false,
    "is_sanitation_lead" BOOLEAN NOT NULL DEFAULT false,
    "is_manual_override" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");
CREATE INDEX "users_username_idx" ON "users"("username");
CREATE INDEX "users_is_active_idx" ON "users"("is_active");
CREATE INDEX "users_role_idx" ON "users"("role");
CREATE INDEX "users_shift_id_idx" ON "users"("shift_id");

CREATE UNIQUE INDEX "attendance_user_id_date_key" ON "attendance"("user_id", "date");
CREATE INDEX "attendance_user_id_idx" ON "attendance"("user_id");
CREATE INDEX "attendance_date_idx" ON "attendance"("date");
CREATE INDEX "attendance_status_idx" ON "attendance"("status");
CREATE INDEX "attendance_created_at_idx" ON "attendance"("created_at");

CREATE UNIQUE INDEX "system_config_key_key" ON "system_config"("key");

CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

CREATE INDEX "leaves_user_id_idx" ON "leaves"("user_id");
CREATE INDEX "leaves_status_idx" ON "leaves"("status");
CREATE INDEX "leaves_user_id_status_idx" ON "leaves"("user_id", "status");
CREATE INDEX "leaves_created_at_idx" ON "leaves"("created_at");

CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");
CREATE INDEX "notifications_is_read_idx" ON "notifications"("is_read");
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

CREATE INDEX "shift_swaps_requester_id_idx" ON "shift_swaps"("requester_id");
CREATE INDEX "shift_swaps_target_user_id_idx" ON "shift_swaps"("target_user_id");
CREATE INDEX "shift_swaps_date_idx" ON "shift_swaps"("date");
CREATE INDEX "shift_swaps_status_idx" ON "shift_swaps"("status");
CREATE INDEX "shift_swaps_requester_id_status_idx" ON "shift_swaps"("requester_id", "status");
CREATE INDEX "shift_swaps_created_at_idx" ON "shift_swaps"("created_at");

CREATE INDEX "off_day_requests_user_id_idx" ON "off_day_requests"("user_id");
CREATE INDEX "off_day_requests_target_user_id_idx" ON "off_day_requests"("target_user_id");
CREATE INDEX "off_day_requests_status_idx" ON "off_day_requests"("status");
CREATE INDEX "off_day_requests_user_id_status_idx" ON "off_day_requests"("user_id", "status");
CREATE INDEX "off_day_requests_created_at_idx" ON "off_day_requests"("created_at");

CREATE UNIQUE INDEX "user_schedules_user_id_date_key" ON "user_schedules"("user_id", "date");
CREATE INDEX "user_schedules_user_id_idx" ON "user_schedules"("user_id");
CREATE INDEX "user_schedules_date_idx" ON "user_schedules"("date");

CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leaves" ADD CONSTRAINT "leaves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "off_day_requests" ADD CONSTRAINT "off_day_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "off_day_requests" ADD CONSTRAINT "off_day_requests_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_schedules" ADD CONSTRAINT "user_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_schedules" ADD CONSTRAINT "user_schedules_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
