/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    Column,
    Entity,
    Index,
    PrimaryColumn,
} from 'typeorm';
import { TableName } from './constants.ts';

@Index(['agent', 'status', 'concurrencyKey'])
@Index(['status', 'createdAt', 'id'])
@Entity({ name: TableName.RUNS })
export class RunEntity {
    @PrimaryColumn({
        name: 'id',
        type: 'varchar',
        length: 128,
        collation: 'C',
    })
    id!: string;

    @Column({
        name: 'agent', 
        type: 'varchar', 
        length: 64, 
    })
    agent!: string;

    @Column({
        name: 'status', 
        type: 'varchar', 
        length: 16, 
    })
    status!: string;

    @Column({ name: 'trigger', type: 'jsonb' })
    trigger!: Record<string, unknown>;

    @Column({
        name: 'concurrency_key',
        type: 'varchar',
        length: 255,
        nullable: true,
    })
    concurrencyKey!: string | null;

    @Column({
        name: 'thread',
        type: 'varchar',
        length: 255,
        nullable: true,
    })
    thread!: string | null;

    @Column({
        name: 'output', 
        type: 'jsonb', 
        nullable: true, 
    })
    output!: unknown;

    @Column({
        name: 'error', 
        type: 'jsonb', 
        nullable: true, 
    })
    error!: Record<string, unknown> | null;

    @Column({ name: 'usage', type: 'jsonb' })
    usage!: Record<string, unknown>;

    @Column({
        name: 'waiting', 
        type: 'jsonb', 
        nullable: true, 
    })
    waiting!: Record<string, unknown> | null;

    @Column({
        name: 'claim_owner',
        type: 'varchar',
        length: 255,
        nullable: true,
    })
    claimOwner!: string | null;

    @Column({
        name: 'claim_expires_at', 
        type: 'timestamp with time zone', 
        nullable: true, 
    })
    claimExpiresAt!: Date | null;

    @Column({
        name: 'cancel_requested', 
        type: 'boolean', 
        nullable: true, 
    })
    cancelRequested!: boolean | null;

    @Column({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt!: Date;

    @Column({ name: 'updated_at', type: 'timestamp with time zone' })
    updatedAt!: Date;

    @Column({
        name: 'started_at', 
        type: 'timestamp with time zone', 
        nullable: true, 
    })
    startedAt!: Date | null;

    @Column({
        name: 'finished_at', 
        type: 'timestamp with time zone', 
        nullable: true, 
    })
    finishedAt!: Date | null;
}
