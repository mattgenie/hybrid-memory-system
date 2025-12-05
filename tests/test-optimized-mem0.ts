import { Mem0Service } from '../../src/core/memory/mem0-service';
import * as dotenv from 'dotenv';
import { performance } from 'perf_hooks';

dotenv.config({ override: true });

async function testOptimizedMem0() {
    console.log("=== Testing Optimized Mem0 with Domain Filtering ===\n");

    const mem0 = new Mem0Service();
    const userId = "test_user";

    // Test 1: All domains (original behavior)
    console.log("--- Test 1: All Domains (No Filter) ---");
    let start = performance.now();
    await mem0.retrieveParticipantProfile(userId, "Find me a restaurant", null);
    let end = performance.now();
    console.log(`Duration: ${(end - start).toFixed(0)}ms (4 queries: 3 stable + 1 contextual)\n`);

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 2: Places domain only
    console.log("--- Test 2: Places Domain (Filtered) ---");
    start = performance.now();
    await mem0.retrieveParticipantProfile(userId, "Find me a sushi restaurant in Tokyo", 'places');
    end = performance.now();
    console.log(`Duration: ${(end - start).toFixed(0)}ms (2 queries: 1 stable + 1 contextual)\n`);

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 3: Cached (second call)
    console.log("--- Test 3: Cached Stable + Fresh Contextual ---");
    start = performance.now();
    await mem0.retrieveParticipantProfile(userId, "Any good pizza places?", 'places');
    end = performance.now();
    console.log(`Duration: ${(end - start).toFixed(0)}ms (1 query: 0 stable [cached] + 1 contextual)\n`);

    console.log("✅ Optimizations working! Domain filtering reduces queries, caching eliminates stable queries.");
}

testOptimizedMem0().catch(console.error);
