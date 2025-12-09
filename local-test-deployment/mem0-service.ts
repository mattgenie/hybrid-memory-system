import { MemoryClient } from 'mem0ai';
import { ParticipantProfile } from '../types';
import * as dotenv from 'dotenv';

dotenv.config();

interface CacheEntry {
    profile: ParticipantProfile;
    timestamp: number;
}

export class Mem0Service {
    private client: MemoryClient;
    private cache: Map<string, CacheEntry> = new Map();
    private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    constructor() {
        const apiKey = process.env.MEM0_API_KEY;
        if (!apiKey) {
            console.warn('MEM0_API_KEY not found in environment variables. Mem0 will not work.');
        }
        this.client = new MemoryClient({ apiKey: apiKey || 'dummy' });
    }

    /**
     * Retrieves a participant profile with caching and domain-specific optimization.
     * @param userId - User ID
     * @param context - Current context
     * @param domain - Optional domain filter ('places', 'movies', 'music', or null for all)
     */
    async retrieveParticipantProfile(
        userId: string,
        context: string,
        domain: 'places' | 'movies' | 'music' | null = null
    ): Promise<ParticipantProfile> {
        // Check cache (only for stable preferences)
        const cacheKey = `${userId}:stable`;
        const cached = this.cache.get(cacheKey);
        const now = Date.now();

        if (cached && (now - cached.timestamp) < this.CACHE_TTL_MS) {
            console.log(`[Mem0] Using cached profile for user ${userId}`);
            // Still fetch contextual for current query
            const contextualResults = await this.searchMemories(userId, context);
            return this.mergeWithContextual(cached.profile, contextualResults, domain);
        }

        console.log(`[Mem0] Retrieving profile for user ${userId} with context: "${context}"`);

        // Optimize: Only fetch relevant domain queries
        const stableQueries = this.getStableQueriesForDomain(domain);

        try {
            // Execute searches in parallel
            const stableResultsPromises = stableQueries.map(q =>
                this.searchMemories(userId, q.query, q.filters)
            );

            const contextualResultsPromise = this.searchMemories(userId, context);

            const [stableResultsArrays, contextualResults] = await Promise.all([
                Promise.all(stableResultsPromises),
                contextualResultsPromise
            ]);

            // Flatten stable results and deduplicate by ID
            const allStableMemories = stableResultsArrays.flat();
            const uniqueStableMemories = Array.from(new Map(allStableMemories.map(m => [m.id, m])).values());

            // Build profile with ONLY the requested domain's preferences
            const profile: ParticipantProfile = {
                userId,
                stable_traits: this.formatMemories(uniqueStableMemories),
                places_preferences: null,
                movies_preferences: null,
                music_preferences: null
            };

            // Only populate the requested domain(s)
            if (domain === 'places' || domain === null) {
                profile.places_preferences = {
                    stable_preferences: this.extractDomainMemories(uniqueStableMemories, ['food', 'restaurant', 'cuisine', 'dinner', 'lunch', 'breakfast', 'allergy']),
                    contextual_preferences: this.extractDomainMemories(contextualResults, ['food', 'restaurant', 'cuisine', 'dinner', 'lunch', 'breakfast', 'allergy', 'sushi', 'pizza', 'burger']),
                };
            }

            if (domain === 'movies' || domain === null) {
                profile.movies_preferences = {
                    stable_preferences: this.extractDomainMemories(uniqueStableMemories, ['movie', 'film', 'director', 'actor', 'cinema']),
                    contextual_preferences: this.extractDomainMemories(contextualResults, ['movie', 'film', 'director', 'actor', 'cinema']),
                };
            }

            if (domain === 'music' || domain === null) {
                profile.music_preferences = {
                    stable_preferences: this.extractDomainMemories(uniqueStableMemories, ['music', 'song', 'artist', 'concert', 'band', 'genre']),
                    contextual_preferences: this.extractDomainMemories(contextualResults, ['music', 'song', 'artist', 'concert', 'band', 'genre']),
                };
            }

            // Cache stable parts only
            this.cache.set(cacheKey, { profile, timestamp: now });

            return profile;

        } catch (error) {
            console.error("Error retrieving mem0 profile:", error);
            // Return empty profile on error
            return { userId };
        }
    }

    private getStableQueriesForDomain(domain: 'places' | 'movies' | 'music' | null): Array<{ query: string, filters?: any }> {
        // Optimize: Only fetch relevant queries based on domain with metadata filters
        if (domain === 'places') {
            return [{
                query: "food allergies dietary restrictions favorite restaurants cuisines",
                filters: { "AND": [{ "metadata.topic": "food" }] }
            }];
        } else if (domain === 'movies') {
            return [{
                query: "favorite movie genres directors actors",
                filters: { "AND": [{ "metadata.topic": "movies" }] }
            }];
        } else if (domain === 'music') {
            return [{
                query: "favorite music artists genres",
                filters: { "AND": [{ "metadata.topic": "music" }] }
            }];
        } else {
            // Fetch all (for general queries or when domain is unknown)
            return [
                { query: "food allergies dietary restrictions favorite restaurants cuisines", filters: { "AND": [{ "metadata.topic": "food" }] } },
                { query: "favorite movie genres directors actors", filters: { "AND": [{ "metadata.topic": "movies" }] } },
                { query: "favorite music artists genres", filters: { "AND": [{ "metadata.topic": "music" }] } }
            ];
        }
    }

    private mergeWithContextual(
        cachedProfile: ParticipantProfile,
        contextualResults: any[],
        domain: 'places' | 'movies' | 'music' | null
    ): ParticipantProfile {
        const merged: ParticipantProfile = {
            ...cachedProfile
        };

        // Only populate preferences for the requested domain
        if (domain === 'places' || domain === null) {
            merged.places_preferences = {
                ...cachedProfile.places_preferences,
                contextual_preferences: this.extractDomainMemories(contextualResults, ['food', 'restaurant', 'cuisine', 'dinner', 'lunch', 'breakfast', 'allergy', 'sushi', 'pizza', 'burger']),
            };
        }

        if (domain === 'movies' || domain === null) {
            merged.movies_preferences = {
                ...cachedProfile.movies_preferences,
                contextual_preferences: this.extractDomainMemories(contextualResults, ['movie', 'film', 'director', 'actor', 'cinema']),
            };
        }

        if (domain === 'music' || domain === null) {
            merged.music_preferences = {
                ...cachedProfile.music_preferences,
                contextual_preferences: this.extractDomainMemories(contextualResults, ['music', 'song', 'artist', 'concert', 'band', 'genre']),
            };
        }

        return merged;
    }

    /**
     * Simple keyword-based topic inference
     * In production, this could use an LLM for better classification
     */
    private inferTopicFromText(text: string): 'food' | 'movies' | 'music' | null {
        const lowerText = text.toLowerCase();

        // Food keywords
        const foodKeywords = ['restaurant', 'food', 'cuisine', 'meal', 'dinner', 'lunch', 'breakfast',
            'cafe', 'coffee', 'pizza', 'sushi', 'burger', 'vegetarian', 'vegan',
            'allergic', 'allergy', 'dietary', 'eat', 'hungry', 'dish'];

        // Movie/TV keywords
        const movieKeywords = ['movie', 'film', 'cinema', 'director', 'actor', 'actress', 'show',
            'series', 'episode', 'tv', 'watch', 'netflix', 'genre', 'thriller',
            'comedy', 'drama', 'action'];

        // Music keywords
        const musicKeywords = ['music', 'song', 'artist', 'album', 'band', 'concert', 'genre',
            'rock', 'pop', 'jazz', 'classical', 'rap', 'hip hop', 'listen',
            'spotify', 'playlist'];

        // Count matches for each category
        const foodCount = foodKeywords.filter(k => lowerText.includes(k)).length;
        const movieCount = movieKeywords.filter(k => lowerText.includes(k)).length;
        const musicCount = musicKeywords.filter(k => lowerText.includes(k)).length;

        // Return topic with highest match count
        const max = Math.max(foodCount, movieCount, musicCount);
        if (max === 0) return null;

        if (foodCount === max) return 'food';
        if (movieCount === max) return 'movies';
        if (musicCount === max) return 'music';

        return null;
    }

    private queryCache = new Map<string, { results: any[], timestamp: number }>();
    private readonly QUERY_CACHE_TTL = 60 * 1000; // 1 minute

    private async searchMemories(userId: string, query: string, filters?: any): Promise<any[]> {
        const cacheKey = `${userId}:${query}:${JSON.stringify(filters || {})}`;
        const cached = this.queryCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < this.QUERY_CACHE_TTL) {
            console.log(`[Mem0] Using cached query result for: "${query}"`);
            return cached.results;
        }

        try {
            console.log(`[Mem0] Searching: "${query}"${filters ? ' with filters' : ''}`);

            // Optimized search parameters based on managed platform best practices
            const searchParams: any = {
                user_id: userId,
                limit: 2, // Reduced from 3 for faster response
                threshold: 0.0, // Accept all confidence levels (maximize recall)
                rerank: false // Disabled for speed - rely on metadata filter precision
            };

            // Add metadata filters if provided
            if (filters) {
                searchParams.filters = filters;
            }

            const memories = await this.client.search(query, searchParams);
            console.log(`[Mem0] Found ${memories?.length || 0} memories for query: "${query}"`);
            if (memories?.length > 0) {
                console.log(`[Mem0] Top result: ${memories[0].memory}`);
            }

            const results = memories || [];
            this.queryCache.set(cacheKey, { results, timestamp: Date.now() });
            return results;

        } catch (error) {
            console.error(`Error searching memories for query '${query}': `, error);
            return [];
        }
    }

    private formatMemories(memories: any[]): string {
        return memories.map(m => m.memory).join("; ");
    }

    private extractDomainMemories(memories: any[], keywords: string[]): string {
        const relevant = memories.filter(m => {
            const text = (m.memory || "").toLowerCase();
            return keywords.some(k => text.includes(k));
        });
        return relevant.map(m => m.memory).join("; ");
    }

    /**
     * Get all memories for a user (for syncing to Qdrant)
     */
    async getAllMemories(userId: string): Promise<Array<{ memory: string; metadata: any }>> {
        try {
            const response = await this.client.getAll({ user_id: userId });
            return response.map((item: any) => ({
                memory: item.memory,
                metadata: item.metadata || {}
            }));
        } catch (error) {
            console.error(`[Mem0] Error getting all memories:`, error);
            return [];
        }
    }

    /**
     * Add a memory to Mem0
     */
    async addMemory(
        userId: string,
        messages: Array<{ role: 'user' | 'assistant'; content: string }>,
        metadata?: any
    ): Promise<void> {
        try {
            await this.client.add(messages, { user_id: userId, metadata });
            console.log(`[Mem0] Added memory for user ${userId}`);
        } catch (error) {
            console.error(`[Mem0] Error adding memory:`, error);
            throw error;
        }
    }
}
