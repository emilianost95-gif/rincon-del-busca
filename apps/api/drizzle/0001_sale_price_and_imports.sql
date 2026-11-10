CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"file_name" text NOT NULL,
	"sheets" text DEFAULT '' NOT NULL,
	"options" jsonb,
	"stats" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "unit_price" integer;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill: las ventas anteriores toman el precio vigente del producto.
UPDATE "stock_movements" AS m SET "unit_price" = p."sale_price" FROM "products" AS p WHERE m."product_id" = p."id" AND m."type" = 'OUT' AND m."unit_price" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movements_type_created_idx" ON "stock_movements" ("type", "created_at");
