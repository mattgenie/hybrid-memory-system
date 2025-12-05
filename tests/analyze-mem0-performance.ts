import { Mem0Service } from '../../src/core/memory/mem0-service';
import * as dotenv from 'dotenv';
import { performance } from 'perf_hooks';

dotenv.config({ override: true });

async function analyzeMem0Performance() {
    console.log("=== Mem0 Performance Analysis ===\n");

    const mem0 = new Mem0Service();
    const userId = "test_user";
    const context = "I'm going to Tokyo next month. Find sushi restaurants.";

    // Measure the full retrieveParticipantProfile call
    console.log("--- Full Profile Retrieval ---");
    const fullStart = performance.now();
    const profile = await mem0.retrieveParticipantProfile(userId, context);
    const fullEnd = performance.now();
    const fullDuration = fullEnd - fullStart;

    console.log(`\nTotal Duration: ${fullDuration.toFixed(0)}ms`);
    console.log(`Profile result:`, JSON.stringify(profile, null, 2).substring(0, 200) + "...");

    // The queries are static strings, so "generation time" is 0ms
    console.log("\n--- Query Construction Time ---");
    const queryStart = performance.now();
    const stableQueries = [
        "food allergies dietary restrictions favorite restaurants cuisines",
        "favorite movie genres directors actors",
        "favorite music artists genres"
    ];
    const contextualQuery = context;
    const queryEnd = performance.now();
    console.log(`Query construction: ${(queryEnd - queryStart).toFixed(3)}ms (essentially 0ms - they're static strings)`);
    console.log(`Number of queries: ${stableQueries.length + 1} (3 stable + 1 contextual)`);

    // Analysis
    console.log("\n--- Optimization Opportunities ---");
    console.log("1. **Reduce query count**: Currently sending 4 queries (~3.5s). Could we consolidate?");
    console.log("2. **Cache stable preferences**: These don't change often, cache for 24hrs?");
    console.log("3. **Lazy loading**: Only fetch what's needed for current domain (places/movies/music)?");
    console.log("4. **Skip personalization**: For simple queries, bypass mem0 entirely?");
    console.log("\nBottleneck: Mem0 API latency (~2-3.5s per query), NOT query generation.");
}

analyzeMem0Performance().catch(console.error);
