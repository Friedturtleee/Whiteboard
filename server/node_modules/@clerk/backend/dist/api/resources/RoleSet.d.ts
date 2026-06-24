import type { RoleSetItemJSON, RoleSetJSON, RoleSetMigrationJSON } from './JSON';
/**
 * The Backend `RoleSetItem` object represents a role that belongs to a {@link RoleSet}.
 */
export declare class RoleSetItem {
    /**
     * The unique identifier for the role.
     */
    readonly id: string;
    /**
     * The name of the role.
     */
    readonly name: string;
    /**
     * The unique key of the role.
     */
    readonly key: string;
    /**
     * A description of the role.
     */
    readonly description: string | null;
    /**
     * The date when the role was first created.
     */
    readonly createdAt: number;
    /**
     * The date when the role was last updated.
     */
    readonly updatedAt: number;
    /**
     * The number of organization members that have this role.
     */
    readonly membersCount?: number | null | undefined;
    /**
     * Whether any organization members have this role.
     */
    readonly hasMembers?: boolean | null | undefined;
    constructor(
    /**
     * The unique identifier for the role.
     */
    id: string, 
    /**
     * The name of the role.
     */
    name: string, 
    /**
     * The unique key of the role.
     */
    key: string, 
    /**
     * A description of the role.
     */
    description: string | null, 
    /**
     * The date when the role was first created.
     */
    createdAt: number, 
    /**
     * The date when the role was last updated.
     */
    updatedAt: number, 
    /**
     * The number of organization members that have this role.
     */
    membersCount?: number | null | undefined, 
    /**
     * Whether any organization members have this role.
     */
    hasMembers?: boolean | null | undefined);
    static fromJSON(data: RoleSetItemJSON): RoleSetItem;
}
/**
 * The Backend `RoleSetMigration` object holds information about an in-progress migration between role sets.
 */
export declare class RoleSetMigration {
    readonly id: string;
    readonly organizationId: string | null;
    readonly instanceId: string;
    readonly sourceRoleSetId: string;
    readonly destRoleSetId: string | null;
    readonly triggerType: string;
    readonly status: string;
    readonly migratedMembers: number;
    readonly mappings: Record<string, string> | null;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly startedAt?: number | undefined;
    readonly completedAt?: number | undefined;
    constructor(id: string, organizationId: string | null, instanceId: string, sourceRoleSetId: string, destRoleSetId: string | null, triggerType: string, status: string, migratedMembers: number, mappings: Record<string, string> | null, createdAt: number, updatedAt: number, startedAt?: number | undefined, completedAt?: number | undefined);
    static fromJSON(data: RoleSetMigrationJSON): RoleSetMigration;
}
/**
 * The Backend `RoleSet` object represents a collection of roles that can be assigned to organization members.
 */
export declare class RoleSet {
    /**
     * The unique identifier for the role set.
     */
    readonly id: string;
    /**
     * The name of the role set.
     */
    readonly name: string;
    /**
     * The unique key of the role set.
     */
    readonly key: string;
    /**
     * A description of the role set.
     */
    readonly description: string | null;
    /**
     * The roles that belong to the role set.
     */
    readonly roles: RoleSetItem[];
    /**
     * The default role assigned to new organization members.
     */
    readonly defaultRole: RoleSetItem | null;
    /**
     * The role assigned to the creator of an organization.
     */
    readonly creatorRole: RoleSetItem | null;
    /**
     * The type of the role set. `initial` role sets are the default for new organizations.
     */
    readonly type: 'initial' | 'custom';
    /**
     * Active migration information, only present when a migration is in progress.
     */
    readonly roleSetMigration: RoleSetMigration | null;
    /**
     * The date when the role set was first created.
     */
    readonly createdAt: number;
    /**
     * The date when the role set was last updated.
     */
    readonly updatedAt: number;
    constructor(
    /**
     * The unique identifier for the role set.
     */
    id: string, 
    /**
     * The name of the role set.
     */
    name: string, 
    /**
     * The unique key of the role set.
     */
    key: string, 
    /**
     * A description of the role set.
     */
    description: string | null, 
    /**
     * The roles that belong to the role set.
     */
    roles: RoleSetItem[], 
    /**
     * The default role assigned to new organization members.
     */
    defaultRole: RoleSetItem | null, 
    /**
     * The role assigned to the creator of an organization.
     */
    creatorRole: RoleSetItem | null, 
    /**
     * The type of the role set. `initial` role sets are the default for new organizations.
     */
    type: 'initial' | 'custom', 
    /**
     * Active migration information, only present when a migration is in progress.
     */
    roleSetMigration: RoleSetMigration | null, 
    /**
     * The date when the role set was first created.
     */
    createdAt: number, 
    /**
     * The date when the role set was last updated.
     */
    updatedAt: number);
    static fromJSON(data: RoleSetJSON): RoleSet;
}
//# sourceMappingURL=RoleSet.d.ts.map