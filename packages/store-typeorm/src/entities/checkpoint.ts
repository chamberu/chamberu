/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    Column,
    Entity,
    PrimaryColumn,
} from 'typeorm';
import { TableName } from './constants.ts';

@Entity({ name: TableName.CHECKPOINTS })
export class CheckpointEntity {
    @PrimaryColumn({
        name: 'run_id', 
        type: 'varchar', 
        length: 128, 
    })
    runId!: string;

    @Column({ name: 'step_index', type: 'integer' })
    stepIndex!: number;

    @Column({ name: 'messages', type: 'jsonb' })
    messages!: unknown;

    @Column({
        name: 'finish_reason',
        type: 'varchar',
        length: 64,
        nullable: true,
    })
    finishReason!: string | null;

    @Column({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt!: Date;
}
