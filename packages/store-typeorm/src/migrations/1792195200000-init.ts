/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1792195200000 implements MigrationInterface {
    name = 'Init1792195200000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "chamberu_checkpoints" (
                "run_id" character varying(128) NOT NULL,
                "step_index" integer NOT NULL,
                "messages" jsonb NOT NULL,
                "finish_reason" character varying(64),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_d0549bdaf44100277f3573561cb" PRIMARY KEY ("run_id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "chamberu_docs" (
                "agent" character varying(64) NOT NULL,
                "collection" character varying(255) NOT NULL,
                "id" character varying(255) NOT NULL,
                "doc" jsonb NOT NULL,
                CONSTRAINT "PK_4295fefb3d07b2b59edd03bb7e5" PRIMARY KEY ("agent", "collection", "id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_chamberu_docs_doc_gin" ON "chamberu_docs" USING gin ("doc")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamberu_effects" (
                "key" character varying(512) NOT NULL,
                "result" jsonb,
                CONSTRAINT "PK_7fb2e468cabe232a81c1b268f34" PRIMARY KEY ("key")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "chamberu_idempotency_keys" (
                "scope" character varying(255) NOT NULL,
                "key" character varying(512) NOT NULL,
                "run_id" character varying(128) NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_2627332526e8e1c262f044d0cb8" PRIMARY KEY ("scope", "key")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_c33705f0ac307138996a6ac106" ON "chamberu_idempotency_keys" ("expires_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamberu_kv" (
                "agent" character varying(64) NOT NULL,
                "key" character varying(512) NOT NULL,
                "value" jsonb NOT NULL,
                CONSTRAINT "PK_d233cd69d8b336316095d52d725" PRIMARY KEY ("agent", "key")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "chamberu_locks" (
                "key" character varying(512) NOT NULL,
                "owner" character varying(255) NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_836a0a3a636b596077033fda072" PRIMARY KEY ("key")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_4ca58e2c3649d4c740624222f2" ON "chamberu_locks" ("expires_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamberu_runs" (
                "id" character varying(128) COLLATE "C" NOT NULL,
                "agent" character varying(64) NOT NULL,
                "status" character varying(16) NOT NULL,
                "trigger" jsonb NOT NULL,
                "concurrency_key" character varying(255),
                "thread" character varying(255),
                "output" jsonb,
                "error" jsonb,
                "usage" jsonb NOT NULL,
                "waiting" jsonb,
                "claim_owner" character varying(255),
                "claim_expires_at" TIMESTAMP WITH TIME ZONE,
                "cancel_requested" boolean,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "started_at" TIMESTAMP WITH TIME ZONE,
                "finished_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_a2178a599d194316d8202924a52" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_3ff46e34511211c8e8dd9e566d" ON "chamberu_runs" ("status", "created_at", "id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_6f499bcab68b4383c604ed03dd" ON "chamberu_runs" ("agent", "status", "concurrency_key")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamberu_steps" (
                "seq" BIGSERIAL NOT NULL,
                "run_id" character varying(128) NOT NULL,
                "step_index" integer NOT NULL,
                "kind" character varying(8) NOT NULL,
                "name" character varying(255),
                "input" jsonb,
                "output" jsonb,
                "error" jsonb,
                "started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "finished_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_dbba1edf4658fb65f51ca470e85" PRIMARY KEY ("seq")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_0d9d5c7ee1d7a0cf4909d27216" ON "chamberu_steps" ("run_id", "step_index")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_0d9d5c7ee1d7a0cf4909d27216"
        `);
        await queryRunner.query(`
            DROP TABLE "chamberu_steps"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_6f499bcab68b4383c604ed03dd"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_3ff46e34511211c8e8dd9e566d"
        `);
        await queryRunner.query(`
            DROP TABLE "chamberu_runs"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_4ca58e2c3649d4c740624222f2"
        `);
        await queryRunner.query(`
            DROP TABLE "chamberu_locks"
        `);
        await queryRunner.query(`
            DROP TABLE "chamberu_kv"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_c33705f0ac307138996a6ac106"
        `);
        await queryRunner.query(`
            DROP TABLE "chamberu_idempotency_keys"
        `);
        await queryRunner.query(`
            DROP TABLE "chamberu_effects"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_chamberu_docs_doc_gin"
        `);
        await queryRunner.query(`
            DROP TABLE "chamberu_docs"
        `);
        await queryRunner.query(`
            DROP TABLE "chamberu_checkpoints"
        `);
    }
}
