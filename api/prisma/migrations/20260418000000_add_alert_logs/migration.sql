-- CreateTable
CREATE TABLE "alert_logs" (
    "id"           TEXT         NOT NULL,
    "user_id"      TEXT,
    "team_id"      TEXT,
    "alert_type"   TEXT         NOT NULL,
    "threshold"    INTEGER,
    "current_cost" DOUBLE PRECISION,
    "budget_cap"   DOUBLE PRECISION,
    "delivered"    BOOLEAN      NOT NULL DEFAULT false,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_logs_user_id_created_at_idx" ON "alert_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "alert_logs_team_id_created_at_idx" ON "alert_logs"("team_id", "created_at");
