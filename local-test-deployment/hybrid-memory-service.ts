import { Mem0Service } from './mem0-service';
import { QdrantMemoryService } from './qdrant-memory-service';
import { ParticipantProfile } from '../types';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Hybrid Memory Service: Combines Mem0 and Qdrant
 * 
 * Strategy:
 * - WRITE: Mem0 only (for extraction and processing)
 * - SYNC: Background job to mirror Mem0's PROCESSED memories to Qdrant
 * - READ: Query Qdrant only (3.5x faster, 100% precision)
 * 
 * Why this architecture?
 * - Mem0's add() is async and extracts/rewrites memories
 *   Example: "I have a peanut allergy" → "User has a severe peanut allergy"
 * - Writing raw text to Qdrant in parallel would create inconsistency
 * - Sync ensures both systems have the SAME processed memories
 * 
 * Benefits:
 * - Keep Mem0's memory extraction and categorization
 * - Get Qdrant's speed (230ms vs 800ms)
 * - Get Qdrant's quality (100% precision vs 43%)
 * - Zero API costs for search queries
 * - Consistent data across both systems
 */
export class HybridMemoryService {
    private mem0: Mem0Service;
    private qdrant: QdrantMemoryService;
    private syncInProgress: Map<string, boolean> = new Map();

    constructor() {
        this.mem0 = new Mem0Service();
        this.qdrant = new QdrantMemoryService();
    }

    /**
     * Add a memory to Mem0 only
     * 
     * NOTE: This does NOT write to Qdrant immediately because Mem0's processing
     * is asynchronous and extracts/rewrites memories (e.g., "I have a peanut allergy" 
     * becomes "User has a severe peanut allergy").
     * 
     * To sync to Qdrant, call syncUserFromMem0() after the conversation or periodically.
     * This ensures Qdrant gets Mem0's PROCESSED memories, not raw text.
     */
    async addMemory(
        userId: string,
        messages: Array<{ role: 'user' | 'assistant'; content: string }>,
        metadata?: { topic?: 'food' | 'movies' | 'music'; type?: 'stable' | 'contextual' }
    ): Promise<void> {
        console.log(`[Hybrid] Adding memory for user ${userId} (Mem0 only)`);

        try {
            // Write to Mem0 - it will extract and process the memory asynchronously
            await this.mem0.addMemory(userId, messages, metadata);

            console.log(`[Hybrid] Memory queued in Mem0 for processing`);
            console.log(`[Hybrid] 💡 Tip: Call syncUserFromMem0('${userId}') to mirror to Qdrant`);
        } catch (error) {
            console.error(`[Hybrid] Error adding memory to Mem0:`, error);
            throw error;
        }
    }

    /**
     * Retrieve participant profile from Qdrant (fast!)
     * Mem0 is not queried for reads - only Qdrant
     */
    async retrieveParticipantProfile(
        userId: string,
        context: string,
        domain: 'places' | 'movies' | 'music' | null = null
    ): Promise<ParticipantProfile> {
        console.log(`[Hybrid] Retrieving profile from Qdrant (fast path)`);

        // Query Qdrant only - 3.5x faster than Mem0
        return this.qdrant.retrieveParticipantProfile(userId, context, domain);
    }

    /**
     * Add a memory and immediately sync to Qdrant
     * 
     * Use this when you need the memory available in Qdrant quickly.
     * Waits for Mem0's async processing before syncing.
     * 
     * @param delayMs - Delay in ms to wait for Mem0 processing (default: 3000ms)
     */
    async addMemoryAndSync(
        userId: string,
        messages: Array<{ role: 'user' | 'assistant'; content: string }>,
        metadata?: { topic?: 'food' | 'movies' | 'music'; type?: 'stable' | 'contextual' },
        delayMs: number = 3000
    ): Promise<{ synced: number; errors: number }> {
        console.log(`[Hybrid] Adding memory and syncing for user ${userId}`);

        // Add to Mem0
        await this.addMemory(userId, messages, metadata);

        // Wait for Mem0's async processing
        console.log(`[Hybrid] Waiting ${delayMs}ms for Mem0 to process...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));

        // Sync to Qdrant
        return this.syncUserFromMem0(userId);
    }


    /**
     * Sync all memories from Mem0 to Qdrant for a user
     * This is a background job that ensures consistency
     */
    async syncUserFromMem0(userId: string): Promise<{ synced: number; errors: number }> {
        // Prevent concurrent syncs for the same user
        if (this.syncInProgress.get(userId)) {
            console.log(`[Hybrid] Sync already in progress for user ${userId}`);
            return { synced: 0, errors: 0 };
        }

        this.syncInProgress.set(userId, true);
        console.log(`[Hybrid] Starting sync from Mem0 to Qdrant for user ${userId}`);

        try {
            // Get all memories from Mem0
            const mem0Memories = await this.mem0.getAllMemories(userId);
            console.log(`[Hybrid] Found ${mem0Memories.length} memories in Mem0`);

            let synced = 0;
            let errors = 0;

            // Mirror each memory to Qdrant
            for (const memory of mem0Memories) {
                try {
                    await this.qdrant.addMemory(
                        userId,
                        memory.memory,
                        this.inferTopic(memory.memory),
                        this.inferType(memory.metadata)
                    );
                    synced++;
                } catch (error) {
                    console.error(`[Hybrid] Error syncing memory:`, error);
                    errors++;
                }
            }

            console.log(`[Hybrid] Sync complete: ${synced} synced, ${errors} errors`);
            return { synced, errors };

        } finally {
            this.syncInProgress.delete(userId);
        }
    }

    /**
     * Sync all users from Mem0 to Qdrant
     * Run this once to bootstrap Qdrant with existing Mem0 data
     */
    async syncAllFromMem0(userIds: string[]): Promise<Map<string, { synced: number; errors: number }>> {
        console.log(`[Hybrid] Starting full sync for ${userIds.length} users`);

        const results = new Map<string, { synced: number; errors: number }>();

        for (const userId of userIds) {
            const result = await this.syncUserFromMem0(userId);
            results.set(userId, result);
        }

        console.log(`[Hybrid] Full sync complete`);
        return results;
    }

    /**
     * Helper: Infer topic from memory text
     */
    private inferTopic(text: string): 'food' | 'movies' | 'music' | undefined {
        const lower = text.toLowerCase();
        if (lower.match(/food|restaurant|cuisine|meal|dinner|lunch|eat/)) return 'food';
        if (lower.match(/movie|film|cinema|director|actor/)) return 'movies';
        if (lower.match(/music|song|artist|album|band/)) return 'music';
        return undefined;
    }

    /**
     * Helper: Infer type from metadata
     */
    private inferType(metadata: any): 'stable' | 'contextual' {
        // You can customize this based on Mem0's metadata structure
        return metadata?.type || 'stable';
    }
}
