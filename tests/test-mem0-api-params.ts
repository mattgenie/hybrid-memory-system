import { MemoryClient } from 'mem0ai';
import * as dotenv from 'dotenv';
import { performance } from 'perf_hooks';

dotenv.config({ override: true });

async function testMem0OptimizationParams() {
    console.log("=== Testing Mem0 API Optimization Parameters ===\n");

    const apiKey = process.env.MEM0_API_KEY;
    if (!apiKey) {
        console.error("MEM0_API_KEY not found");
        return;
    }

    const client = new MemoryClient({ apiKey });
    const userId = "test_user";
    const query = "favorite restaurants";

    // Test 1: Baseline (current settings)
    console.log("--- Test 1: Baseline (limit: 5, no threshold) ---");
    let start = performance.now();
    await client.search(query, { user_id: userId, limit: 5 });
    let end = performance.now();
    console.log(`Latency: ${(end - start).toFixed(0)}ms\n`);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 2: Reduced limit
    console.log("--- Test 2: Reduced Limit (limit: 3) ---");
    start = performance.now();
    await client.search(query, { user_id: userId, limit: 3 });
    end = performance.now();
    console.log(`Latency: ${(end - start).toFixed(0)}ms\n`);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 3: With threshold (if supported)
    console.log("--- Test 3: With Threshold (threshold: 0.7) ---");
    start = performance.now();
    try {
        await client.search(query, { user_id: userId, limit: 5, threshold: 0.7 } as any);
        end = performance.now();
        console.log(`Latency: ${(end - start).toFixed(0)}ms\n`);
    } catch (error: any) {
        console.log(`Failed (parameter not supported): ${error.message}\n`);
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 4: Explicit rerank=true
    console.log("--- Test 4: Explicit Rerank=True ---");
    start = performance.now();
    try {
        await client.search(query, { user_id: userId, limit: 5, rerank: true } as any);
        end = performance.now();
        console.log(`Latency: ${(end - start).toFixed(0)}ms\n`);
    } catch (error: any) {
        console.log(`Failed (parameter not supported): ${error.message}\n`);
    }

    // Check SDK version and documentation
    console.log("--- SDK Info ---");
    console.log("Check npm package version: npm list mem0ai");
    console.log("Expected: Mem0 Platform = sub-50ms, self-hosted = variable");
    console.log("Our observed: ~2-3 seconds");
    console.log("\nConclusion: 40-60x slower than documented platform performance suggests:");
    console.log("1. Using self-hosted Mem0 (not managed platform)");
    console.log("2. Or network/region latency issues");
    console.log("3. Or undocumented rate limiting");
}

testMem0OptimizationParams().catch(console.error);
