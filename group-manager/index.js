const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityProviderClient, AdminAddUserToGroupCommand, AdminRemoveUserFromGroupCommand, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { v4: uuidv4 } = require('uuid');

// Initialize AWS services
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const cognitoIdp = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });

// Environment variables
const GROUPS_TABLE = process.env.GROUPS_TABLE;
const GROUP_MEMBERSHIPS_TABLE = process.env.GROUP_MEMBERSHIPS_TABLE;
const GROUP_PERMISSIONS_TABLE = process.env.GROUP_PERMISSIONS_TABLE;
const SHARED_WALLETS_TABLE = process.env.SHARED_WALLETS_TABLE;
const GROUP_ACTIVITIES_TABLE = process.env.GROUP_ACTIVITIES_TABLE;
const GROUP_INVITATIONS_TABLE = process.env.GROUP_INVITATIONS_TABLE;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE;
const USER_NOTIFICATIONS_TABLE = process.env.USER_NOTIFICATIONS_TABLE;
const WALLET_METADATA_TABLE = process.env.WALLET_METADATA_TABLE;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

// Permission levels
const PERMISSION_LEVELS = {
    OWNER: 'owner',
    ADMIN: 'admin',
    EDITOR: 'editor',
    VIEWER: 'viewer'
};

// Resource types
const RESOURCE_TYPES = {
    WALLET: 'wallet',
    GROUP: 'group',
    ACTIVITY: 'activity'
};

// Activity types
const ACTIVITY_TYPES = {
    GROUP_CREATED: 'group_created',
    MEMBER_ADDED: 'member_added',
    MEMBER_REMOVED: 'member_removed',
    WALLET_SHARED: 'wallet_shared',
    WALLET_UNSHARED: 'wallet_unshared',
    PERMISSION_CHANGED: 'permission_changed',
    ROLE_CHANGED: 'role_changed',
    INVITATION_SENT: 'invitation_sent',
    INVITATION_ACCEPTED: 'invitation_accepted',
    INVITATION_DECLINED: 'invitation_declined'
};

// Invitation statuses
const INVITATION_STATUS = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    DECLINED: 'declined',
    EXPIRED: 'expired'
};

class GroupManager {
    constructor() {}

    // =======================
    // USER PROFILE MANAGEMENT
    // =======================

    async createOrUpdateUserProfile(userId, email, hederaAccountId = null) {
        try {
            const now = new Date().toISOString();
            const profileData = {
                user_id: userId,
                updated_at: now
            };

            // Only include email if it's not null (to avoid GSI index errors)
            if (email) {
                profileData.email = email;
            }

            if (hederaAccountId) {
                profileData.hedera_account_id = hederaAccountId;
            }

            // Check if profile exists
            const existingProfile = await this.getUserProfile(userId);
            if (existingProfile) {
                // Build update expression dynamically
                const updateExpressions = ['updated_at = :updated_at'];
                const expressionAttributeValues = { ':updated_at': now };

                if (email) {
                    updateExpressions.push('email = :email');
                    expressionAttributeValues[':email'] = email;
                }

                if (hederaAccountId) {
                    updateExpressions.push('hedera_account_id = :hedera_account_id');
                    expressionAttributeValues[':hedera_account_id'] = hederaAccountId;
                }

                await dynamodb.send(new UpdateCommand({
                    TableName: USER_PROFILES_TABLE,
                    Key: { user_id: userId },
                    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
                    ExpressionAttributeValues: expressionAttributeValues
                }));
            } else {
                // Create new profile
                profileData.created_at = now;
                await dynamodb.send(new PutCommand({
                    TableName: USER_PROFILES_TABLE,
                    Item: profileData
                }));
            }

            return profileData;
        } catch (error) {
            console.error('Failed to create/update user profile:', error);
            throw error;
        }
    }

    async getUserProfile(userId) {
        try {
            const result = await dynamodb.send(new GetCommand({
                TableName: USER_PROFILES_TABLE,
                Key: { user_id: userId }
            }));
            return result.Item || null;
        } catch (error) {
            console.error('Failed to get user profile:', error);
            return null;
        }
    }

    async getUserByEmail(email) {
        try {
            const result = await dynamodb.send(new QueryCommand({
                TableName: USER_PROFILES_TABLE,
                IndexName: 'EmailIndex',
                KeyConditionExpression: 'email = :email',
                ExpressionAttributeValues: {
                    ':email': email
                }
            }));
            return result.Items?.[0] || null;
        } catch (error) {
            console.error('Failed to get user by email:', error);
            return null;
        }
    }

    async getUserByHederaAccountId(accountId) {
        try {
            const result = await dynamodb.send(new QueryCommand({
                TableName: USER_PROFILES_TABLE,
                IndexName: 'HederaAccountIndex',
                KeyConditionExpression: 'hedera_account_id = :account_id',
                ExpressionAttributeValues: {
                    ':account_id': accountId
                }
            }));
            return result.Items?.[0] || null;
        } catch (error) {
            console.error('Failed to get user by hedera account ID:', error);
            return null;
        }
    }

    async enrichUserData(userId) {
        try {
            // Helper function to transform snake_case to camelCase
            const transformToCamelCase = (obj) => {
                if (Array.isArray(obj)) {
                    return obj.map(transformToCamelCase);
                } else if (obj !== null && typeof obj === 'object') {
                    return Object.keys(obj).reduce((result, key) => {
                        const camelKey = key.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
                        result[camelKey] = transformToCamelCase(obj[key]);
                        return result;
                    }, {});
                }
                return obj;
            };

            // Get user profile
            const profile = await this.getUserProfile(userId);
            if (profile) {
                // Transform field names from snake_case to camelCase
                const transformedProfile = transformToCamelCase(profile);
                console.log(`🔍 enrichUserData: Transformed profile for ${userId}:`, JSON.stringify(transformedProfile, null, 2));
                return transformedProfile;
            }

            // If no profile exists, try to get data from Cognito
            try {
                const cognitoUser = await cognitoIdp.send(new AdminGetUserCommand({
                    UserPoolId: COGNITO_USER_POOL_ID,
                    Username: userId
                }));

                const email = cognitoUser.UserAttributes?.find(attr => attr.Name === 'email')?.Value;
                if (email) {
                    // Create profile from Cognito data
                    const newProfile = await this.createOrUpdateUserProfile(userId, email);
                    return transformToCamelCase(newProfile);
                }
            } catch (cognitoError) {
                console.log('Could not get Cognito user data:', cognitoError.message);
            }

            return transformToCamelCase({ user_id: userId, email: null });
        } catch (error) {
            console.error('Failed to enrich user data:', error);
            return transformToCamelCase({ user_id: userId, email: null });
        }
    }

    // =======================
    // GROUP MANAGEMENT (Updated with security)
    // =======================

    async createGroup(ownerId, groupName, description = '') {
        try {
            const groupId = uuidv4();
            const now = new Date().toISOString();

            // Create group
            await dynamodb.send(new PutCommand({
                TableName: GROUPS_TABLE,
                Item: {
                    group_id: groupId,
                    group_name: groupName,
                    description,
                    owner_id: ownerId,
                    created_at: now,
                    updated_at: now,
                    member_count: 1,
                    status: 'active'
                }
            }));

            // Add owner as first member with owner role
            await this.addGroupMember(groupId, ownerId, PERMISSION_LEVELS.OWNER, ownerId);

            // Set default permissions for the group
            await this.setDefaultGroupPermissions(groupId);

            // Log activity
            await this.logActivity(groupId, ownerId, ACTIVITY_TYPES.GROUP_CREATED, {
                group_name: groupName,
                description
            });

            // Add owner to Cognito TeamOwners group
            await this.addUserToCognitoGroup(ownerId, 'TeamOwners');

            console.log(`Created group ${groupId} for owner ${ownerId}`);
            
            return {
                groupId,
                groupName,
                description,
                ownerId,
                createdAt: now
            };

        } catch (error) {
            console.error('Failed to create group:', error);
            throw error;
        }
    }

    async getGroup(groupId) {
        try {
            const result = await dynamodb.send(new GetCommand({
                TableName: GROUPS_TABLE,
                Key: { group_id: groupId }
            }));

            return result.Item || null;
        } catch (error) {
            console.error('Failed to get group:', error);
            throw error;
        }
    }

    async updateGroup(groupId, updates, updatedBy) {
        try {
            const now = new Date().toISOString();
            
            // Check if group exists
            const group = await this.getGroup(groupId);
            if (!group) {
                throw new Error('Group not found');
            }

            // Check if user has permission to update (owner or admin only)
            const userMembership = await this.getGroupMember(groupId, updatedBy);
            if (!userMembership || (userMembership.role !== PERMISSION_LEVELS.OWNER && userMembership.role !== PERMISSION_LEVELS.ADMIN)) {
                throw new Error('Insufficient permissions to update group');
            }

            // Build update expression
            const updateExpressions = [];
            const attributeValues = { ':now': now };
            const attributeNames = {};

            if (updates.groupName || updates.group_name) {
                updateExpressions.push('#name = :name');
                attributeNames['#name'] = 'group_name';
                attributeValues[':name'] = updates.groupName || updates.group_name;
            }

            if (updates.description !== undefined) {
                updateExpressions.push('description = :desc');
                attributeValues[':desc'] = updates.description;
            }

            updateExpressions.push('updated_at = :now');

            if (updateExpressions.length === 1) {
                // Only updated_at, no actual changes
                throw new Error('No updates provided');
            }

            // Update group
            await dynamodb.send(new UpdateCommand({
                TableName: GROUPS_TABLE,
                Key: { group_id: groupId },
                UpdateExpression: `SET ${updateExpressions.join(', ')}`,
                ExpressionAttributeValues: attributeValues,
                ExpressionAttributeNames: Object.keys(attributeNames).length > 0 ? attributeNames : undefined
            }));

            // Log activity
            await this.logActivity(groupId, updatedBy, 'group_updated', {
                updates: updates
            });

            console.log(`Updated group ${groupId} by ${updatedBy}`);
            
            return await this.getGroup(groupId);

        } catch (error) {
            console.error('Failed to update group:', error);
            throw error;
        }
    }

    async getUserGroups(userId) {
        try {
            const result = await dynamodb.send(new QueryCommand({
                TableName: GROUP_MEMBERSHIPS_TABLE,
                IndexName: 'UserGroupsIndex',
                KeyConditionExpression: 'user_id = :userId',
                ExpressionAttributeValues: {
                    ':userId': userId
                }
            }));

            const groupIds = result.Items.map(item => item.group_id);
            
            if (groupIds.length === 0) {
                return [];
            }

            // Get group details
            const groups = [];
            for (const groupId of groupIds) {
                const group = await this.getGroup(groupId);
                if (group) {
                    const membership = result.Items.find(item => item.group_id === groupId);
                    groups.push({
                        ...group,
                        user_role: membership.role,
                        joined_at: membership.joined_at
                    });
                }
            }

            return groups;
        } catch (error) {
            console.error('Failed to get user groups:', error);
            throw error;
        }
    }

    // =======================
    // MEMBERSHIP MANAGEMENT
    // =======================

    async addGroupMember(groupId, userId, role = PERMISSION_LEVELS.VIEWER, addedBy) {
        try {
            const now = new Date().toISOString();

            // Check if group exists
            const group = await this.getGroup(groupId);
            if (!group) {
                throw new Error('Group not found');
            }

            // Check if user is already a member
            const existingMember = await this.getGroupMember(groupId, userId);
            if (existingMember) {
                throw new Error('User is already a member of this group');
            }

            // Add membership
            await dynamodb.send(new PutCommand({
                TableName: GROUP_MEMBERSHIPS_TABLE,
                Item: {
                    group_id: groupId,
                    user_id: userId,
                    role,
                    joined_at: now,
                    added_by: addedBy,
                    status: 'active'
                }
            }));

            // Update group member count
            await dynamodb.send(new UpdateCommand({
                TableName: GROUPS_TABLE,
                Key: { group_id: groupId },
                UpdateExpression: 'ADD member_count :inc SET updated_at = :now',
                ExpressionAttributeValues: {
                    ':inc': 1,
                    ':now': now
                }
            }));

            // Add user to appropriate Cognito group
            const cognitoGroup = this.getCognitoGroupForRole(role);
            if (cognitoGroup) {
                await this.addUserToCognitoGroup(userId, cognitoGroup);
            }

            // Log activity
            await this.logActivity(groupId, addedBy, ACTIVITY_TYPES.MEMBER_ADDED, {
                user_id: userId,
                role
            });

            console.log(`Added user ${userId} to group ${groupId} with role ${role}`);

        } catch (error) {
            console.error('Failed to add group member:', error);
            throw error;
        }
    }

    async removeGroupMember(groupId, userId, removedBy) {
        try {
            const now = new Date().toISOString();

            // Check if member exists
            const member = await this.getGroupMember(groupId, userId);
            if (!member) {
                throw new Error('User is not a member of this group');
            }

            // Don't allow removing the owner
            if (member.role === PERMISSION_LEVELS.OWNER) {
                throw new Error('Cannot remove group owner');
            }

            // Remove membership
            await dynamodb.send(new DeleteCommand({
                TableName: GROUP_MEMBERSHIPS_TABLE,
                Key: {
                    group_id: groupId,
                    user_id: userId
                }
            }));

            // Update group member count
            await dynamodb.send(new UpdateCommand({
                TableName: GROUPS_TABLE,
                Key: { group_id: groupId },
                UpdateExpression: 'ADD member_count :dec SET updated_at = :now',
                ExpressionAttributeValues: {
                    ':dec': -1,
                    ':now': now
                }
            }));

            // Log activity
            await this.logActivity(groupId, removedBy, ACTIVITY_TYPES.MEMBER_REMOVED, {
                user_id: userId,
                previous_role: member.role
            });

            console.log(`Removed user ${userId} from group ${groupId}`);

        } catch (error) {
            console.error('Failed to remove group member:', error);
            throw error;
        }
    }

    async getGroupMember(groupId, userId) {
        try {
            const result = await dynamodb.send(new GetCommand({
                TableName: GROUP_MEMBERSHIPS_TABLE,
                Key: {
                    group_id: groupId,
                    user_id: userId
                }
            }));

            return result.Item || null;
        } catch (error) {
            console.error('Failed to get group member:', error);
            throw error;
        }
    }

    async getGroupMembers(groupId) {
        try {
            const result = await dynamodb.send(new QueryCommand({
                TableName: GROUP_MEMBERSHIPS_TABLE,
                KeyConditionExpression: 'group_id = :groupId',
                ExpressionAttributeValues: {
                    ':groupId': groupId
                }
            }));

            const members = result.Items || [];
            console.log(`🔍 getGroupMembers: Found ${members.length} members for group ${groupId}`);

            // Enrich each member with user profile data
            const enrichedMembers = await Promise.all(
                members.map(async (member) => {
                    try {
                        console.log(`🔍 getGroupMembers: Enriching member ${member.user_id}`);
                        const userProfile = await this.enrichUserData(member.user_id);
                        console.log(`🔍 getGroupMembers: User profile for ${member.user_id}:`, userProfile);
                        
                        // Merge membership data with user profile data
                        const enrichedMember = {
                            ...member,
                            email: userProfile.email,
                            hederaAccountId: userProfile.hederaAccountId,
                            // Keep original fields in camelCase for API response
                            userId: member.user_id,
                            groupId: member.group_id,
                            joinedAt: member.joined_at
                        };
                        
                        console.log(`🔍 getGroupMembers: Enriched member data:`, enrichedMember);
                        return enrichedMember;
                    } catch (profileError) {
                        console.error(`Failed to enrich user data for ${member.user_id}:`, profileError);
                        // Return member data with fallback values
                        return {
                            ...member,
                            email: null,
                            hederaAccountId: null,
                            userId: member.user_id,
                            groupId: member.group_id,
                            joinedAt: member.joined_at
                        };
                    }
                })
            );

            console.log(`🔍 getGroupMembers: Returning ${enrichedMembers.length} enriched members`);
            return enrichedMembers;
        } catch (error) {
            console.error('Failed to get group members:', error);
            throw error;
        }
    }

    // =======================
    // WALLET SHARING
    // =======================

    async shareWalletWithGroup(groupId, walletId, sharedBy, permissions = {}) {
        try {
            const now = new Date().toISOString();

            // Verify wallet ownership or permission
            const wallet = await this.getWalletMetadata(walletId);
            if (!wallet) {
                throw new Error('Wallet not found');
            }

            if (wallet.user_id !== sharedBy) {
                throw new Error('Only wallet owner can share wallet');
            }

            // Check if wallet is already shared with this group
            const existingShare = await this.getSharedWallet(groupId, walletId);
            if (existingShare) {
                throw new Error('Wallet is already shared with this group');
            }

            // Create shared wallet record
            await dynamodb.send(new PutCommand({
                TableName: SHARED_WALLETS_TABLE,
                Item: {
                    group_id: groupId,
                    wallet_id: walletId,
                    shared_by: sharedBy,
                    shared_at: now,
                    permissions: permissions || {
                        view_balance: true,
                        view_transactions: true,
                        initiate_transactions: false
                    },
                    status: 'active'
                }
            }));

            // Log activity
            await this.logActivity(groupId, sharedBy, ACTIVITY_TYPES.WALLET_SHARED, {
                wallet_id: walletId,
                permissions
            });

            console.log(`Shared wallet ${walletId} with group ${groupId}`);

        } catch (error) {
            console.error('Failed to share wallet with group:', error);
            throw error;
        }
    }

    async unshareWalletFromGroup(groupId, walletId, unsharedBy) {
        try {
            // Verify permission to unshare
            const sharedWallet = await this.getSharedWallet(groupId, walletId);
            if (!sharedWallet) {
                throw new Error('Wallet is not shared with this group');
            }

            if (sharedWallet.shared_by !== unsharedBy) {
                // Check if user has admin permissions
                const member = await this.getGroupMember(groupId, unsharedBy);
                if (!member || (member.role !== PERMISSION_LEVELS.OWNER && member.role !== PERMISSION_LEVELS.ADMIN)) {
                    throw new Error('Insufficient permissions to unshare wallet');
                }
            }

            // Remove shared wallet record
            await dynamodb.send(new DeleteCommand({
                TableName: SHARED_WALLETS_TABLE,
                Key: {
                    group_id: groupId,
                    wallet_id: walletId
                }
            }));

            // Log activity
            await this.logActivity(groupId, unsharedBy, ACTIVITY_TYPES.WALLET_UNSHARED, {
                wallet_id: walletId
            });

            console.log(`Unshared wallet ${walletId} from group ${groupId}`);

        } catch (error) {
            console.error('Failed to unshare wallet from group:', error);
            throw error;
        }
    }

    async getSharedWallet(groupId, walletId) {
        try {
            const result = await dynamodb.send(new GetCommand({
                TableName: SHARED_WALLETS_TABLE,
                Key: {
                    group_id: groupId,
                    wallet_id: walletId
                }
            }));

            return result.Item || null;
        } catch (error) {
            console.error('Failed to get shared wallet:', error);
            throw error;
        }
    }

    async getGroupSharedWallets(groupId) {
        try {
            const result = await dynamodb.send(new QueryCommand({
                TableName: SHARED_WALLETS_TABLE,
                KeyConditionExpression: 'group_id = :groupId',
                ExpressionAttributeValues: {
                    ':groupId': groupId
                }
            }));

            return result.Items || [];
        } catch (error) {
            console.error('Failed to get group shared wallets:', error);
            throw error;
        }
    }

    // =======================
    // PERMISSION MANAGEMENT
    // =======================

    async setDefaultGroupPermissions(groupId) {
        try {
            const defaultPermissions = [
                {
                    group_id: groupId,
                    resource_type: RESOURCE_TYPES.WALLET,
                    permission_level: PERMISSION_LEVELS.OWNER,
                    permissions: {
                        view_balance: true,
                        view_transactions: true,
                        initiate_transactions: true,
                        share_wallet: true,
                        manage_permissions: true
                    }
                },
                {
                    group_id: groupId,
                    resource_type: RESOURCE_TYPES.WALLET,
                    permission_level: PERMISSION_LEVELS.ADMIN,
                    permissions: {
                        view_balance: true,
                        view_transactions: true,
                        initiate_transactions: true,
                        share_wallet: true,
                        manage_permissions: false
                    }
                },
                {
                    group_id: groupId,
                    resource_type: RESOURCE_TYPES.WALLET,
                    permission_level: PERMISSION_LEVELS.EDITOR,
                    permissions: {
                        view_balance: true,
                        view_transactions: true,
                        initiate_transactions: false,
                        share_wallet: false,
                        manage_permissions: false
                    }
                },
                {
                    group_id: groupId,
                    resource_type: RESOURCE_TYPES.WALLET,
                    permission_level: PERMISSION_LEVELS.VIEWER,
                    permissions: {
                        view_balance: true,
                        view_transactions: false,
                        initiate_transactions: false,
                        share_wallet: false,
                        manage_permissions: false
                    }
                }
            ];

            for (const permission of defaultPermissions) {
                await dynamodb.send(new PutCommand({
                    TableName: GROUP_PERMISSIONS_TABLE,
                    Item: permission
                }));
            }

        } catch (error) {
            console.error('Failed to set default group permissions:', error);
            throw error;
        }
    }

    async checkUserPermission(groupId, userId, action) {
        try {
            // Get user's role in the group
            const member = await this.getGroupMember(groupId, userId);
            if (!member) {
                console.log(`❌ Permission check failed: User ${userId} is not a member of group ${groupId}`);
                return false;
            }

            console.log(`🔍 Permission check: User ${userId} has role ${member.role} in group ${groupId}, checking action: ${action}`);

            // For group-level actions, check based on role hierarchy
            if (action === 'view_group' || action === 'view_members' || action === 'view_wallets') {
                // All members can view group, members, and wallets
                return true;
            }

            if (action === 'invite_members' || action === 'remove_members') {
                // Only editors, admins, and owners can invite/remove members
                return member.role === PERMISSION_LEVELS.EDITOR || 
                       member.role === PERMISSION_LEVELS.ADMIN || 
                       member.role === PERMISSION_LEVELS.OWNER;
            }

            if (action === 'update_group' || action === 'manage_permissions') {
                // Only admins and owners can update group or manage permissions
                return member.role === PERMISSION_LEVELS.ADMIN || 
                       member.role === PERMISSION_LEVELS.OWNER;
            }

            if (action === 'share_wallets' || action === 'unshare_wallets') {
                // Only editors, admins, and owners can share/unshare wallets
                return member.role === PERMISSION_LEVELS.EDITOR || 
                       member.role === PERMISSION_LEVELS.ADMIN || 
                       member.role === PERMISSION_LEVELS.OWNER;
            }

            // For wallet-specific permissions, check the detailed permissions table
            if (['view_balance', 'view_transactions', 'initiate_transactions'].includes(action)) {
                const result = await dynamodb.send(new QueryCommand({
                    TableName: GROUP_PERMISSIONS_TABLE,
                    KeyConditionExpression: 'group_id = :groupId',
                    FilterExpression: 'resource_type = :resourceType AND permission_level = :permissionLevel',
                    ExpressionAttributeValues: {
                        ':groupId': groupId,
                        ':resourceType': RESOURCE_TYPES.WALLET,
                        ':permissionLevel': member.role
                    }
                }));

                if (!result.Items || result.Items.length === 0) {
                    console.log(`❌ Permission check failed: No permissions found for role ${member.role} in group ${groupId}`);
                    return false;
                }

                const permissions = result.Items[0].permissions || {};
                const hasPermission = permissions[action] === true;
                console.log(`🔍 Permission check result: ${action} = ${hasPermission} for role ${member.role}`);
                return hasPermission;
            }

            // Default deny for unknown actions
            console.log(`❌ Permission check failed: Unknown action ${action}`);
            return false;

        } catch (error) {
            console.error('Failed to check user permission:', error);
            return false;
        }
    }

    // =======================
    // INVITATION MANAGEMENT
    // =======================

    async createInvitation(groupId, inviterUserId, inviteeIdentifier, role = PERMISSION_LEVELS.VIEWER) {
        try {
            // Check if inviter has permission to invite
            if (!await this.checkUserPermission(groupId, inviterUserId, 'invite_members')) {
                throw new Error('Insufficient permissions to invite members');
            }

            // Resolve invitee user ID from identifier (email or account ID)
            let inviteeUserId = null;
            let inviteeProfile = null;

            // First try to find by account ID
            if (inviteeIdentifier.startsWith('0.0.')) {
                inviteeProfile = await this.getUserByHederaAccountId(inviteeIdentifier);
            }

            // If not found by account ID, try by email
            if (!inviteeProfile && inviteeIdentifier.includes('@')) {
                inviteeProfile = await this.getUserByEmail(inviteeIdentifier);
            }

            // If still not found, create a pending profile
            if (!inviteeProfile) {
                if (inviteeIdentifier.includes('@')) {
                    // Email invitation
                    const tempUserId = `pending_${uuidv4()}`;
                    inviteeProfile = await this.createOrUpdateUserProfile(tempUserId, inviteeIdentifier);
                    inviteeUserId = tempUserId;
                } else {
                    // Account ID invitation
                    const tempUserId = `pending_${uuidv4()}`;
                    inviteeProfile = await this.createOrUpdateUserProfile(tempUserId, null, inviteeIdentifier);
                    inviteeUserId = tempUserId;
                }
            } else {
                inviteeUserId = inviteeProfile.user_id;
            }

            // Check if user is already a member
            const existingMembership = await this.getGroupMember(groupId, inviteeUserId);
            if (existingMembership) {
                throw new Error('User is already a member of this group');
            }

            // Check if there's already a pending invitation
            const existingInvitation = await this.getPendingInvitation(groupId, inviteeUserId);
            if (existingInvitation) {
                throw new Error('There is already a pending invitation for this user');
            }

            // Create invitation
            const invitationId = uuidv4();
            const now = new Date().toISOString();
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

            const invitation = {
                invitation_id: invitationId,
                group_id: groupId,
                inviter_user_id: inviterUserId,
                invitee_user_id: inviteeUserId,
                invitee_identifier: inviteeIdentifier, // Store the original identifier for matching
                role: role,
                status: INVITATION_STATUS.PENDING,
                created_at: now,
                expires_at: expiresAt
            };

            await dynamodb.send(new PutCommand({
                TableName: GROUP_INVITATIONS_TABLE,
                Item: invitation
            }));

            // Get group and inviter details for notifications
            const group = await this.getGroup(groupId);
            const inviterProfile = await this.enrichUserData(inviterUserId);

            // Send notifications
            await this.sendInvitationNotifications(invitation, group, inviterProfile, inviteeProfile);

            // Log activity
            await this.logActivity(groupId, inviterUserId, ACTIVITY_TYPES.INVITATION_SENT, {
                invitee_identifier: inviteeIdentifier,
                invitee_user_id: inviteeUserId,
                role: role
            });

            console.log(`Created invitation ${invitationId} for group ${groupId}`);
            return invitation;

        } catch (error) {
            console.error('Failed to create invitation:', error);
            throw error;
        }
    }

    async getPendingInvitation(groupId, userId) {
        try {
            const result = await dynamodb.send(new QueryCommand({
                TableName: GROUP_INVITATIONS_TABLE,
                IndexName: 'GroupInvitationsIndex',
                KeyConditionExpression: 'group_id = :group_id',
                FilterExpression: 'invitee_user_id = :user_id AND #status = :status',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':group_id': groupId,
                    ':user_id': userId,
                    ':status': INVITATION_STATUS.PENDING
                }
            }));

            return result.Items?.[0] || null;
        } catch (error) {
            console.error('Failed to get pending invitation:', error);
            return null;
        }
    }

    async getUserInvitations(userId, status = null) {
        try {
            console.log(`🔍 getUserInvitations: Looking for invitations for user ${userId}`);
            
            // First, get direct invitations for this user ID
            const directParams = {
                TableName: GROUP_INVITATIONS_TABLE,
                IndexName: 'InviteeInvitationsIndex',
                KeyConditionExpression: 'invitee_user_id = :user_id',
                ExpressionAttributeValues: {
                    ':user_id': userId
                },
                ScanIndexForward: false // Most recent first
            };

            if (status) {
                directParams.FilterExpression = '#status = :status';
                directParams.ExpressionAttributeNames = { '#status': 'status' };
                directParams.ExpressionAttributeValues[':status'] = status;
            }

            const directResult = await dynamodb.send(new QueryCommand(directParams));
            let allInvitations = directResult.Items || [];
            console.log(`🔍 getUserInvitations: Found ${allInvitations.length} direct invitations`);

            // Also look for pending invitations that might match this user's email or Hedera account
            try {
                console.log(`🔍 getUserInvitations: About to call enrichUserData for userId: ${userId}`);
                const userProfile = await this.enrichUserData(userId);
                console.log(`🔍 getUserInvitations: User profile result:`, JSON.stringify(userProfile, null, 2));

                if (userProfile) {
                    console.log(`🔍 getUserInvitations: User profile found - email: ${userProfile.email}, hederaAccountId: ${userProfile.hederaAccountId}`);
                    
                    // Scan for pending invitations that might match this user
                    const scanParams = {
                        TableName: GROUP_INVITATIONS_TABLE,
                        FilterExpression: 'begins_with(invitee_user_id, :pending_prefix) AND #status = :pending_status',
                        ExpressionAttributeNames: {
                            '#status': 'status'
                        },
                        ExpressionAttributeValues: {
                            ':pending_prefix': 'pending_',
                            ':pending_status': 'pending'
                        }
                    };

                    console.log(`🔍 getUserInvitations: Scanning for pending invitations with params:`, JSON.stringify(scanParams, null, 2));
                    const scanResult = await dynamodb.send(new ScanCommand(scanParams));
                    const pendingInvitations = scanResult.Items || [];
                    console.log(`🔍 getUserInvitations: Found ${pendingInvitations.length} pending invitations to check`);
                    console.log(`🔍 getUserInvitations: Pending invitations:`, JSON.stringify(pendingInvitations, null, 2));

                    // Check if any pending invitations match this user's email or Hedera account
                    for (const invitation of pendingInvitations) {
                        console.log(`🔍 getUserInvitations: Checking pending invitation ${invitation.invitation_id}`);
                        console.log(`🔍 getUserInvitations: Full invitation object:`, JSON.stringify(invitation, null, 2));
                        
                        // Use the stored invitee_identifier to match against user's profile
                        const storedIdentifier = invitation.invitee_identifier;
                        console.log(`🔍 getUserInvitations: Stored identifier: ${storedIdentifier}`);
                        console.log(`🔍 getUserInvitations: Comparing against user email: ${userProfile.email}, hedera account: ${userProfile.hederaAccountId}`);
                        
                        if (storedIdentifier) {
                            // Check if this identifier matches the user's email or Hedera account
                            let matches = false;
                            
                            if (userProfile.email && storedIdentifier === userProfile.email) {
                                matches = true;
                                console.log(`✅ getUserInvitations: Matched by email: ${userProfile.email} === ${storedIdentifier}`);
                            } else if (userProfile.hederaAccountId && storedIdentifier === userProfile.hederaAccountId) {
                                matches = true;
                                console.log(`✅ getUserInvitations: Matched by Hedera account: ${userProfile.hederaAccountId} === ${storedIdentifier}`);
                            } else {
                                console.log(`❌ getUserInvitations: No match - email: ${userProfile.email} !== ${storedIdentifier}, hedera: ${userProfile.hederaAccountId} !== ${storedIdentifier}`);
                            }
                            
                            if (matches) {
                                console.log(`✅ getUserInvitations: Adding matched pending invitation ${invitation.invitation_id}`);
                                
                                // Update the invitation to use the actual user ID instead of pending
                                try {
                                    await dynamodb.send(new UpdateCommand({
                                        TableName: GROUP_INVITATIONS_TABLE,
                                        Key: { invitation_id: invitation.invitation_id },
                                        UpdateExpression: 'SET invitee_user_id = :new_user_id',
                                        ExpressionAttributeValues: {
                                            ':new_user_id': userId
                                        }
                                    }));
                                    
                                    // Update the invitation object to reflect the change
                                    invitation.invitee_user_id = userId;
                                    console.log(`✅ getUserInvitations: Updated invitation ${invitation.invitation_id} with actual user ID`);
                                } catch (updateError) {
                                    console.error(`❌ getUserInvitations: Failed to update invitation ${invitation.invitation_id}:`, updateError);
                                }
                                
                                allInvitations.push(invitation);
                            }
                        }
                    }
                } else {
                    console.log(`❌ getUserInvitations: No user profile found for userId: ${userId}`);
                }
            } catch (profileError) {
                console.error('❌ getUserInvitations: Failed to get user profile for pending invitation matching:', profileError);
                console.error('❌ getUserInvitations: Profile error details:', profileError.message, profileError.stack);
                // Continue with just direct invitations
            }

            // Apply status filter if specified and we have additional invitations
            if (status && allInvitations.length > 0) {
                allInvitations = allInvitations.filter(inv => inv.status === status);
            }

            // Sort by creation date (most recent first)
            allInvitations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            console.log(`✅ getUserInvitations: Returning ${allInvitations.length} total invitations`);
            return allInvitations;
        } catch (error) {
            console.error('Failed to get user invitations:', error);
            return [];
        }
    }

    async getGroupInvitations(groupId) {
        try {
            const result = await dynamodb.send(new QueryCommand({
                TableName: GROUP_INVITATIONS_TABLE,
                IndexName: 'GroupInvitationsIndex',
                KeyConditionExpression: 'group_id = :group_id',
                ExpressionAttributeValues: {
                    ':group_id': groupId
                },
                ScanIndexForward: false // Most recent first
            }));

            return result.Items || [];
        } catch (error) {
            console.error('Failed to get group invitations:', error);
            return [];
        }
    }

    async respondToInvitation(invitationId, userId, response) {
        try {
            // Get invitation
            const result = await dynamodb.send(new GetCommand({
                TableName: GROUP_INVITATIONS_TABLE,
                Key: { invitation_id: invitationId }
            }));

            const invitation = result.Item;
            if (!invitation) {
                throw new Error('Invitation not found');
            }

            if (invitation.invitee_user_id !== userId) {
                throw new Error('You are not authorized to respond to this invitation');
            }

            if (invitation.status !== INVITATION_STATUS.PENDING) {
                throw new Error('Invitation is no longer pending');
            }

            // Check if invitation has expired
            if (new Date(invitation.expires_at) < new Date()) {
                throw new Error('Invitation has expired');
            }

            const now = new Date().toISOString();
            const newStatus = response === 'accept' ? INVITATION_STATUS.ACCEPTED : INVITATION_STATUS.DECLINED;

            // Update invitation status
            await dynamodb.send(new UpdateCommand({
                TableName: GROUP_INVITATIONS_TABLE,
                Key: { invitation_id: invitationId },
                UpdateExpression: 'SET #status = :status, responded_at = :responded_at',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':status': newStatus,
                    ':responded_at': now
                }
            }));

            if (response === 'accept') {
                // Add user to group
                await this.addGroupMember(invitation.group_id, userId, invitation.role, invitation.inviter_user_id);
                
                // Log activity
                await this.logActivity(invitation.group_id, userId, ACTIVITY_TYPES.INVITATION_ACCEPTED, {
                    invitation_id: invitationId,
                    role: invitation.role
                });
            } else {
                // Log declined invitation
                await this.logActivity(invitation.group_id, userId, ACTIVITY_TYPES.INVITATION_DECLINED, {
                    invitation_id: invitationId
                });
            }

            // Send response notifications
            await this.sendInvitationResponseNotifications(invitation, response, userId);

            console.log(`Invitation ${invitationId} ${response}ed by user ${userId}`);
            return { success: true, status: newStatus };

        } catch (error) {
            console.error('Failed to respond to invitation:', error);
            throw error;
        }
    }

    // =======================
    // NOTIFICATION MANAGEMENT
    // =======================

    async sendInvitationNotifications(invitation, group, inviterProfile, inviteeProfile) {
        try {
            const now = new Date().toISOString();
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).getTime(); // 30 days

            // Notification to invitee
            const inviteeNotification = {
                userId: invitation.invitee_user_id,
                notificationId: uuidv4(),
                type: 'group_invitation_received',
                title: 'Group Invitation',
                message: `${inviterProfile.email || 'Someone'} invited you to join the group "${group.group_name}"`,
                data: {
                    groupId: invitation.group_id,
                    groupName: group.group_name,
                    inviterEmail: inviterProfile.email,
                    invitationId: invitation.invitation_id,
                    role: invitation.role
                },
                timestamp: now,
                read: false,
                expiresAt: expiresAt
            };

            // Notification to inviter
            const inviterNotification = {
                userId: invitation.inviter_user_id,
                notificationId: uuidv4(),
                type: 'group_invitation_sent',
                title: 'Invitation Sent',
                message: `You invited ${inviteeProfile.email || inviteeProfile.hedera_account_id || 'someone'} to join "${group.group_name}"`,
                data: {
                    groupId: invitation.group_id,
                    groupName: group.group_name,
                    inviteeEmail: inviteeProfile.email,
                    inviteeAccountId: inviteeProfile.hedera_account_id,
                    invitationId: invitation.invitation_id,
                    role: invitation.role
                },
                timestamp: now,
                read: false,
                expiresAt: expiresAt
            };

            // Send both notifications
            await Promise.all([
                dynamodb.send(new PutCommand({
                    TableName: USER_NOTIFICATIONS_TABLE,
                    Item: inviteeNotification
                })),
                dynamodb.send(new PutCommand({
                    TableName: USER_NOTIFICATIONS_TABLE,
                    Item: inviterNotification
                }))
            ]);

        } catch (error) {
            console.error('Failed to send invitation notifications:', error);
            // Don't throw - notifications are not critical
        }
    }

    async sendInvitationResponseNotifications(invitation, response, userId) {
        try {
            const now = new Date().toISOString();
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).getTime(); // 7 days

            const group = await this.getGroup(invitation.group_id);
            const responderProfile = await this.enrichUserData(userId);

            // Notification to inviter
            const inviterNotification = {
                userId: invitation.inviter_user_id,
                notificationId: uuidv4(),
                type: `group_invitation_${response}ed`,
                title: `Invitation ${response === 'accept' ? 'Accepted' : 'Declined'}`,
                message: `${responderProfile.email || 'Someone'} ${response}ed your invitation to join "${group.group_name}"`,
                data: {
                    groupId: invitation.group_id,
                    groupName: group.group_name,
                    responderEmail: responderProfile.email,
                    invitationId: invitation.invitation_id,
                    response: response
                },
                timestamp: now,
                read: false,
                expiresAt: expiresAt
            };

            await dynamodb.send(new PutCommand({
                TableName: USER_NOTIFICATIONS_TABLE,
                Item: inviterNotification
            }));

        } catch (error) {
            console.error('Failed to send invitation response notifications:', error);
            // Don't throw - notifications are not critical
        }
    }

    // =======================
    // ACTIVITY LOGGING
    // =======================

    async logActivity(groupId, userId, activityType, details = {}) {
        try {
            const activityId = uuidv4();
            const timestamp = new Date().toISOString();

            await dynamodb.send(new PutCommand({
                TableName: GROUP_ACTIVITIES_TABLE,
                Item: {
                    group_id: groupId,
                    activity_id: activityId,
                    user_id: userId,
                    activity_type: activityType,
                    timestamp,
                    details,
                    expires_at: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year
                }
            }));

        } catch (error) {
            console.error('Failed to log activity:', error);
            // Don't throw - activity logging shouldn't break main operations
        }
    }

    async getGroupActivities(groupId, limit = 25) {
        try {
            const result = await dynamodb.send(new QueryCommand({
                TableName: GROUP_ACTIVITIES_TABLE,
                KeyConditionExpression: 'group_id = :groupId',
                ExpressionAttributeValues: {
                    ':groupId': groupId
                },
                ScanIndexForward: false, // Most recent first
                Limit: limit
            }));

            return result.Items || [];
        } catch (error) {
            console.error('Failed to get group activities:', error);
            throw error;
        }
    }

    // =======================
    // HELPER METHODS
    // =======================

    async getWalletMetadata(walletId) {
        try {
            const result = await dynamodb.send(new QueryCommand({
                TableName: WALLET_METADATA_TABLE,
                IndexName: 'WalletIdIndex',
                KeyConditionExpression: 'wallet_id = :walletId',
                ExpressionAttributeValues: {
                    ':walletId': walletId
                },
                Limit: 1
            }));

            return result.Items?.[0] || null;
        } catch (error) {
            console.error('Failed to get wallet metadata:', error);
            throw error;
        }
    }

    getCognitoGroupForRole(role) {
        switch (role) {
            case PERMISSION_LEVELS.OWNER:
                return 'TeamOwners';
            case PERMISSION_LEVELS.ADMIN:
                return 'TeamOwners';
            case PERMISSION_LEVELS.EDITOR:
                return 'TeamMembers';
            case PERMISSION_LEVELS.VIEWER:
                return 'TeamMembers';
            default:
                return 'IndividualUsers';
        }
    }

    async addUserToCognitoGroup(userId, groupName) {
        try {
            await cognitoIdp.send(new AdminAddUserToGroupCommand({
                UserPoolId: COGNITO_USER_POOL_ID,
                Username: userId,
                GroupName: groupName
            }));
        } catch (error) {
            console.error(`Failed to add user ${userId} to Cognito group ${groupName}:`, error);
            // Don't throw - Cognito group management shouldn't break main operations
        }
    }
}

// Lambda handler
exports.handler = async (event) => {
    const response = {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: ''
    };

    try {
        console.log('Event:', JSON.stringify(event, null, 2));
        
        const { httpMethod, path, body, requestContext } = event;
        
        // Extract user ID from JWT token
        const userId = requestContext?.authorizer?.claims?.sub || requestContext?.authorizer?.claims?.username;
        
        if (!userId && httpMethod !== 'OPTIONS') {
            response.statusCode = 401;
            response.body = JSON.stringify({ error: 'Unauthorized' });
            return response;
        }
        
        if (httpMethod === 'OPTIONS') {
            return response;
        }

        const groupManager = new GroupManager();
        let requestBody = {};
        
        try {
            requestBody = body ? JSON.parse(body) : {};
        } catch (parseError) {
            response.statusCode = 400;
            response.body = JSON.stringify({ error: 'Invalid JSON in request body' });
            return response;
        }

        // Helper function to transform snake_case to camelCase for API responses
        const transformToCamelCase = (obj) => {
            if (Array.isArray(obj)) {
                return obj.map(transformToCamelCase);
            } else if (obj !== null && typeof obj === 'object') {
                return Object.keys(obj).reduce((result, key) => {
                    const camelKey = key.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
                    result[camelKey] = transformToCamelCase(obj[key]);
                    return result;
                }, {});
            }
            return obj;
        };
        
        // Route handling - Check most specific paths first
        if (path.includes('/groups')) {
            const pathParts = path.split('/').filter(part => part !== '');
            
            // GET /groups/{groupId}/members
            if (httpMethod === 'GET' && pathParts.length === 3 && pathParts[0] === 'groups' && pathParts[2] === 'members') {
                const groupId = pathParts[1];
                const members = await groupManager.getGroupMembers(groupId);
                const transformedMembers = transformToCamelCase(members);
                response.body = JSON.stringify({ success: true, members: transformedMembers });
                
            // POST /groups/{groupId}/members - Send invitation
            } else if (httpMethod === 'POST' && pathParts.length === 3 && pathParts[0] === 'groups' && pathParts[2] === 'members') {
                const groupId = pathParts[1];
                const { identifier, role } = requestBody;
                const invitation = await groupManager.createInvitation(groupId, userId, identifier, role);
                const transformedInvitation = transformToCamelCase(invitation);
                response.body = JSON.stringify({ success: true, invitation: transformedInvitation });
                
            // DELETE /groups/{groupId}/members/{userId} - Remove member
            } else if (httpMethod === 'DELETE' && pathParts.length === 4 && pathParts[0] === 'groups' && pathParts[2] === 'members') {
                const groupId = pathParts[1];
                const removeUserId = pathParts[3];
                
                // Check permissions
                if (!await groupManager.checkUserPermission(groupId, userId, 'remove_members')) {
                    response.statusCode = 403;
                    response.body = JSON.stringify({ error: 'Insufficient permissions to remove members' });
                    return response;
                }
                
                await groupManager.removeGroupMember(groupId, removeUserId, userId);
                response.body = JSON.stringify({ success: true });
                
            // GET /groups/{groupId}/invitations - Get group invitations
            } else if (httpMethod === 'GET' && pathParts.length === 3 && pathParts[0] === 'groups' && pathParts[2] === 'invitations') {
                const groupId = pathParts[1];
                
                // Check permissions - only admins and owners can view all invitations
                if (!await groupManager.checkUserPermission(groupId, userId, 'manage_permissions')) {
                    response.statusCode = 403;
                    response.body = JSON.stringify({ error: 'Insufficient permissions to view invitations' });
                    return response;
                }
                
                const invitations = await groupManager.getGroupInvitations(groupId);
                const transformedInvitations = transformToCamelCase(invitations);
                response.body = JSON.stringify({ success: true, invitations: transformedInvitations });
                
            // GET /groups/{groupId}/wallets
            } else if (httpMethod === 'GET' && pathParts.length === 3 && pathParts[0] === 'groups' && pathParts[2] === 'wallets') {
                const groupId = pathParts[1];
                
                // Check permissions
                if (!await groupManager.checkUserPermission(groupId, userId, 'view_wallets')) {
                    response.statusCode = 403;
                    response.body = JSON.stringify({ error: 'Insufficient permissions to view wallets' });
                    return response;
                }
                
                const sharedWallets = await groupManager.getGroupSharedWallets(groupId);
                const transformedWallets = transformToCamelCase(sharedWallets);
                response.body = JSON.stringify({ success: true, wallets: transformedWallets });
                
            // POST /groups/{groupId}/wallets - Share wallet
            } else if (httpMethod === 'POST' && pathParts.length === 3 && pathParts[0] === 'groups' && pathParts[2] === 'wallets') {
                const groupId = pathParts[1];
                const { walletId, permissions } = requestBody;
                
                // Check permissions
                if (!await groupManager.checkUserPermission(groupId, userId, 'share_wallets')) {
                    response.statusCode = 403;
                    response.body = JSON.stringify({ error: 'Insufficient permissions to share wallets' });
                    return response;
                }
                
                await groupManager.shareWalletWithGroup(groupId, walletId, userId, permissions);
                response.body = JSON.stringify({ success: true });
                
            // DELETE /groups/{groupId}/wallets - Unshare wallet
            } else if (httpMethod === 'DELETE' && pathParts.length === 3 && pathParts[0] === 'groups' && pathParts[2] === 'wallets') {
                const groupId = pathParts[1];
                const { walletId } = requestBody;
                
                // Check permissions
                if (!await groupManager.checkUserPermission(groupId, userId, 'unshare_wallets')) {
                    response.statusCode = 403;
                    response.body = JSON.stringify({ error: 'Insufficient permissions to unshare wallets' });
                    return response;
                }
                
                await groupManager.unshareWalletFromGroup(groupId, walletId, userId);
                response.body = JSON.stringify({ success: true });
                
            // GET /groups/{groupId}/activities
            } else if (httpMethod === 'GET' && pathParts.length === 3 && pathParts[0] === 'groups' && pathParts[2] === 'activities') {
                const groupId = pathParts[1];
                const activities = await groupManager.getGroupActivities(groupId);
                const transformedActivities = transformToCamelCase(activities);
                response.body = JSON.stringify({ success: true, activities: transformedActivities });
                
            // POST /groups - Create group
            } else if (httpMethod === 'POST' && pathParts.length === 1 && pathParts[0] === 'groups') {
                const { groupName, description } = requestBody;
                const result = await groupManager.createGroup(userId, groupName, description);
                const transformedResult = transformToCamelCase(result);
                response.body = JSON.stringify({ success: true, group: transformedResult });
                
            // GET /groups - Get user's groups
            } else if (httpMethod === 'GET' && pathParts.length === 1 && pathParts[0] === 'groups') {
                const groups = await groupManager.getUserGroups(userId);
                const transformedGroups = transformToCamelCase(groups);
                response.body = JSON.stringify({ success: true, groups: transformedGroups });
                
            // GET /groups/{groupId} - Get specific group
            } else if (httpMethod === 'GET' && pathParts.length === 2 && pathParts[0] === 'groups') {
                const groupId = pathParts[1];
                
                // Check permissions
                if (!await groupManager.checkUserPermission(groupId, userId, 'view_group')) {
                    response.statusCode = 403;
                    response.body = JSON.stringify({ error: 'Insufficient permissions to view group' });
                    return response;
                }
                
                const group = await groupManager.getGroup(groupId);
                if (!group) {
                    response.statusCode = 404;
                    response.body = JSON.stringify({ error: 'Group not found' });
                } else {
                    const transformedGroup = transformToCamelCase(group);
                    response.body = JSON.stringify({ success: true, group: transformedGroup });
                }
                
            // PUT /groups/{groupId} - Update group
            } else if (httpMethod === 'PUT' && pathParts.length === 2 && pathParts[0] === 'groups') {
                const groupId = pathParts[1];
                
                // Check permissions
                if (!await groupManager.checkUserPermission(groupId, userId, 'update_group')) {
                    response.statusCode = 403;
                    response.body = JSON.stringify({ error: 'Insufficient permissions to update group' });
                    return response;
                }
                
                const updatedGroup = await groupManager.updateGroup(groupId, requestBody, userId);
                const transformedGroup = transformToCamelCase(updatedGroup);
                response.body = JSON.stringify({ success: true, group: transformedGroup });
                
            } else {
                response.statusCode = 404;
                response.body = JSON.stringify({ error: 'Endpoint not found' });
            }
            
        } else if (path.includes('/invitations')) {
            const pathParts = path.split('/').filter(part => part !== '');
            
            // GET /invitations - Get user's invitations
            if (httpMethod === 'GET' && pathParts.length === 1 && pathParts[0] === 'invitations') {
                const status = event.queryStringParameters?.status || null;
                console.log(`🔍 Lambda Debug: Processing /invitations request for userId: ${userId}, status: ${status}`);
                console.log(`🔍 Lambda Debug: Full JWT claims:`, JSON.stringify(requestContext?.authorizer?.claims, null, 2));
                const invitations = await groupManager.getUserInvitations(userId, status);
                const transformedInvitations = transformToCamelCase(invitations);
                console.log(`🔍 Lambda Debug: Returning ${invitations.length} invitations:`, JSON.stringify(invitations, null, 2));
                response.body = JSON.stringify({ success: true, invitations: transformedInvitations });
                
            // POST /invitations/{invitationId}/respond - Respond to invitation
            } else if (httpMethod === 'POST' && pathParts.length === 3 && pathParts[0] === 'invitations' && pathParts[2] === 'respond') {
                const invitationId = pathParts[1];
                const { response: invitationResponse } = requestBody;
                
                const result = await groupManager.respondToInvitation(invitationId, userId, invitationResponse);
                response.body = JSON.stringify({ success: true, result });
                
            } else {
                response.statusCode = 404;
                response.body = JSON.stringify({ error: 'Endpoint not found' });
            }
            
        } else {
            response.statusCode = 404;
            response.body = JSON.stringify({ error: 'Endpoint not found' });
        }
        
    } catch (error) {
        console.error('Error:', error);
        response.statusCode = 500;
        response.body = JSON.stringify({ 
            error: 'Internal server error',
            message: error.message 
        });
    }

    return response;
};