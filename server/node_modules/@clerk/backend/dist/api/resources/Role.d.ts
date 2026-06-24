import type { RoleJSON } from './JSON';
import { Permission } from './Permission';
/**
 * The Backend `Role` object represents an organization role that can be assigned to organization members.
 */
export declare class Role {
    /**
     * The unique identifier for the role.
     */
    readonly id: string;
    /**
     * The name of the role.
     */
    readonly name: string;
    /**
     * The unique key of the role, in the format `org:role`.
     */
    readonly key: string;
    /**
     * A description of the role.
     */
    readonly description: string | null;
    /**
     * The permissions assigned to the role.
     */
    readonly permissions: Permission[];
    /**
     * Whether this role is eligible to be an organization creator role.
     */
    readonly isCreatorEligible: boolean;
    /**
     * The date when the role was first created.
     */
    readonly createdAt: number;
    /**
     * The date when the role was last updated.
     */
    readonly updatedAt: number;
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
     * The unique key of the role, in the format `org:role`.
     */
    key: string, 
    /**
     * A description of the role.
     */
    description: string | null, 
    /**
     * The permissions assigned to the role.
     */
    permissions: Permission[], 
    /**
     * Whether this role is eligible to be an organization creator role.
     */
    isCreatorEligible: boolean, 
    /**
     * The date when the role was first created.
     */
    createdAt: number, 
    /**
     * The date when the role was last updated.
     */
    updatedAt: number);
    static fromJSON(data: RoleJSON): Role;
}
//# sourceMappingURL=Role.d.ts.map