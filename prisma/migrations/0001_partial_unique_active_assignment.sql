-- Aturan Bisnis BR-08: Maksimal tepat 1 supervisor aktif (end_date IS NULL) per area.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_active_area_assignment"
  ON "area_assignments" ("area_id")
  WHERE "end_date" IS NULL;
