import { MemoryClient } from 'mem0ai';
import * as dotenv from 'dotenv';
import { performance } from 'perf_hooks';

dotenv.config({ override: true });

async function testMem0Parallelism() {
    console.log("=== Mem0 API Parallelism Test ===\n");

    const apiKey = process.env.MEM0_API_KEY;
    if (!apiKey) {
        console.error("MEM0_API_KEY not found");
        return;
    }

    const client = new MemoryClient({ apiKey });
    const userId = "test_user";

    const queries = [
        "food allergies dietary restrictions",
        "favorite movie genres directors",
        "favorite music artists genres",
        "current context query"
    ];

    // Test 1: Sequential execution
    console.log("--- Test 1: Sequential Execution ---");
    const sequentialTimings: number[] = [];
    const sequentialStart = performance.now();

    for (const query of queries) {
        const start = performance.now();
        await client.search(query, { user_id: userId, limit: 5 });
        const end = performance.now();
        const duration = end - start;
        sequentialTimings.push(duration);
        console.log(`  Query "${query.substring(0, 30)}..." → ${duration.toFixed(0)}ms`);
    }

    const sequentialTotal = performance.now() - sequentialStart;
    console.log(`Total: ${sequentialTotal.toFixed(0)}ms\n`);

    // Small delay to avoid rate limiting issues
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: Parallel execution
    console.log("--- Test 2: Parallel Execution (Promise.all) ---");
    const parallelStart = performance.now();
    const parallelTimings: number[] = [];

    const promises = queries.map(async (query, index) => {
        const start = performance.now();
        await client.search(query, { user_id: userId, limit: 5 });
        const end = performance.now();
        const duration = end - start;
        parallelTimings[index] = duration;
        return { query, duration };
    });

    const results = await Promise.all(promises);
    const parallelTotal = performance.now() - parallelStart;

    results.forEach(r => {
        console.log(`  Query "${r.query.substring(0, 30)}..." → ${r.duration.toFixed(0)}ms`);
    });
    console.log(`Total: ${parallelTotal.toFixed(0)}ms\n`);

    // Analysis
    console.log("--- Analysis ---");
    const sequentialSum = sequentialTimings.reduce((a, b) => a + b, 0);
    console.log(`Sequential sum of individual queries: ${sequentialSum.toFixed(0)}ms`);
    console.log(`Sequential total time: ${sequentialTotal.toFixed(0)}ms`);
    console.log(`Parallel total time: ${parallelTotal.toFixed(0)}ms`);

    const expectedParallelTime = Math.max(...parallelTimings);
    console.log(`Expected parallel time (max individual): ${expectedParallelTime.toFixed(0)}ms`);

    const efficiency = (expectedParallelTime / parallelTotal) * 100;
    console.log(`Parallelization efficiency: ${efficiency.toFixed(1)}%`);

    if (parallelTotal < sequentialTotal * 0.6) {
        console.log("\n✅ Mem0 API supports parallel requests efficiently!");
    } else if (parallelTotal < sequentialTotal * 0.9) {
        console.log("\n⚠️ Mem0 API has partial parallelization (possible rate limiting)");
    } else {
        console.log("\n❌ Mem0 API appears to serialize requests (no parallelization benefit)");
    }
}

testMem0Parallelism().catch(console.error);
