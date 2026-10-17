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

@Index('IDX_chamberu_docs_doc_gin', ['doc'], { type: 'gin' })
@Entity({ name: TableName.DOCS })
export class DocEntity {
    @PrimaryColumn({
        name: 'agent', 
        type: 'varchar', 
        length: 64, 
    })
    agent!: string;

    @PrimaryColumn({
        name: 'collection', 
        type: 'varchar', 
        length: 255, 
    })
    collection!: string;

    @PrimaryColumn({
        name: 'id', 
        type: 'varchar', 
        length: 255, 
    })
    id!: string;

    @Column({ name: 'doc', type: 'jsonb' })
    doc!: unknown;
}
