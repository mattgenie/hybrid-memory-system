import { ParticipantProfile } from '../types';
import * as dotenv from 'dotenv';

dotenv.config();

interface QdrantMemory {
    text: string;
    topic: string | null;
    type: string;
    score: number;
}

export class QdrantMemoryService {
    private baseUrl = 'http://localhost:8765';

    async addMemory(userId: string, text: string, topic?: 'food' | 'movies' | 'music', type: 'stable' | 'contextual' = 'stable'): Promise<void> {
        const response = await fetch(`${this.baseUrl}/add_memory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, text, topic, type })
        });

        if (!response.ok) {
            throw new Error(`Failed to add memory: ${response.statusText}`);
        }
    }

    async retrieveParticipantProfile(
        userId: string,
        context: string,
        domain: 'places' | 'movies' | 'music' | null = null
    ): Promise<ParticipantProfile> {
        const startTime = Date.now();

        const response = await fetch(`${this.baseUrl}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, context, domain, limit: 10 })
        });

        if (!response.ok) {
            throw new Error(`Failed to search: ${response.statusText}`);
        }

        const data = await response.json();
        const memories: QdrantMemory[] = data.memories;

        const latency = Date.now() - startTime;
        console.log(`[Qdrant] Query latency: ${latency}ms`);
        console.log(`[Qdrant] Retrieved ${memories.length} memories`);

        // Separate stable and contextual
        const stableMemories = memories.filter(m => m.type === 'stable');
        const contextualMemories = memories.filter(m => m.type === 'contextual');

        // Build profile
        const profile: ParticipantProfile = {
            userId,
            stable_traits: stableMemories.map(m => m.text).join('; '),
            places_preferences: null,
            movies_preferences: null,
            music_preferences: null
        };

        // Populate domain-specific preferences
        if (domain === 'places' || !domain) {
            profile.places_preferences = {
                stable_preferences: this.extractDomain(stableMemories, 'food'),
                contextual_preferences: this.extractDomain(contextualMemories, 'food')
            };
        }

        if (domain === 'movies' || !domain) {
            profile.movies_preferences = {
                stable_preferences: this.extractDomain(stableMemories, 'movies'),
                contextual_preferences: this.extractDomain(contextualMemories, 'movies')
            };
        }

        if (domain === 'music' || !domain) {
            profile.music_preferences = {
                stable_preferences: this.extractDomain(stableMemories, 'music'),
                contextual_preferences: this.extractDomain(contextualMemories, 'music')
            };
        }

        return profile;
    }

    private extractDomain(memories: QdrantMemory[], topic: string): string {
        return memories
            .filter(m => m.topic === topic)
            .map(m => m.text)
            .join('; ');
    }
}
