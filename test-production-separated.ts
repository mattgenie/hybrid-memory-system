import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const QDRANT_URL = 'http://54.145.235.188:8765';
const CLASSIFIER_URL = 'http://54.145.235.188:8766';

async function main() {
    console.log("=".repeat(80));
    console.log("COMPREHENSIVE PRODUCTION TEST - SEPARATED ARCHITECTURE");
    console.log("=".repeat(80));
    console.log();

    const userId = 'production-test-' + Date.now();

    // Test 1: Health Checks
    console.log("=".repeat(80));
    console.log("📋 Test 1: Health Checks");
    console.log("=".repeat(80));
    console.log();

    try {
        const qdrantHealth = await axios.get(`${QDRANT_URL}/health`);
        console.log("✅ Qdrant Service:");
        console.log(JSON.stringify(qdrantHealth.data, null, 2));
    } catch (e) {
        console.log("❌ Qdrant Service: FAILED");
        return;
    }

    try {
        const classifierHealth = await axios.get(`${CLASSIFIER_URL}/health`);
        console.log("\n✅ Classifier Service:");
        console.log(JSON.stringify(classifierHealth.data, null, 2));
    } catch (e) {
        console.log("\n⚠️  Classifier Service: Not accessible (may be internal only)");
    }

    console.log();

    // Test 2: Classifier Service Direct Test
    console.log("=".repeat(80));
    console.log("🤖 Test 2: Classifier Service");
    console.log("=".repeat(80));
    console.log();

    const testTexts = [
        "I have a severe peanut allergy",
        "I love spicy Thai food",
        "I hate cilantro"
    ];

    try {
        const classifyResult = await axios.post(`${CLASSIFIER_URL}/classify`, {
            text: testTexts[0]
        });
        console.log(`Text: "${testTexts[0]}"`);
        console.log(`Classifiers: ${JSON.stringify(classifyResult.data.classifiers)}`);
        console.log("✅ Classifier service working");
    } catch (e) {
        console.log("⚠️  Classifier service not accessible externally (expected if internal only)");
    }

    console.log();

    // Test 3: Insert Performance (Heuristic vs Classifier)
    console.log("=".repeat(80));
    console.log("⚡ Test 3: Insert Performance");
    console.log("=".repeat(80));
    console.log();

    const memories = [
        "I have a severe peanut allergy",
        "I love spicy Thai food",
        "I am vegetarian",
        "I hate cilantro",
        "I'm craving sushi tonight"
    ];

    console.log("Inserting 5 memories...");
    const insertStart = Date.now();

    for (const text of memories) {
        await axios.post(`${QDRANT_URL}/add_memory`, {
            user_id: userId,
            text: text,
            topic: 'food',
            type: 'stable'
        });
    }

    const insertTime = Date.now() - insertStart;
    const avgInsertTime = insertTime / memories.length;

    console.log(`✅ Inserted ${memories.length} memories in ${insertTime}ms`);
    console.log(`   Average: ${avgInsertTime.toFixed(0)}ms per memory`);
    console.log(`   Throughput: ${(1000 / avgInsertTime).toFixed(1)} inserts/sec`);
    console.log();

    // Test 4: Search Quality
    console.log("=".repeat(80));
    console.log("🔍 Test 4: Search Quality");
    console.log("=".repeat(80));
    console.log();

    const queries = [
        "looking for a restaurant for dinner",
        "what are my dietary restrictions",
        "food I should avoid"
    ];

    for (const query of queries) {
        console.log(`Query: "${query}"`);

        const searchStart = Date.now();
        const results = await axios.post(`${QDRANT_URL}/search`, {
            user_id: userId,
            context: query,
            domain: 'places',
            limit: 5,
            use_classifiers: true
        });
        const searchTime = Date.now() - searchStart;

        const memories = results.data.memories || [];

        console.log(`  ⏱️  Latency: ${searchTime}ms`);
        console.log(`  📝 Results: ${memories.length}`);

        memories.forEach((m: any, i: number) => {
            console.log(`    ${i + 1}. ${m.text} (score: ${m.score.toFixed(3)})`);
            console.log(`       Classifiers: ${m.classifiers.join(', ')}`);
        });
        console.log();
    }

    // Test 5: Batch Insert Performance
    console.log("=".repeat(80));
    console.log("📦 Test 5: Batch Insert Performance");
    console.log("=".repeat(80));
    console.log();

    const batchMemories = [
        "I prefer organic vegetables",
        "I don't eat red meat",
        "I love Japanese cuisine",
        "I'm allergic to shellfish",
        "I enjoy spicy food",
        "I avoid processed foods",
        "I like farm-to-table restaurants",
        "I'm lactose intolerant",
        "I prefer gluten-free options",
        "I love fresh seafood"
    ];

    console.log(`Batch inserting ${batchMemories.length} memories...`);
    const batchStart = Date.now();

    await axios.post(`${QDRANT_URL}/add_memories_batch`, {
        memories: batchMemories.map(text => ({
            user_id: userId,
            text: text,
            topic: 'food',
            type: 'stable'
        }))
    });

    const batchTime = Date.now() - batchStart;
    const avgBatchTime = batchTime / batchMemories.length;

    console.log(`✅ Batch inserted ${batchMemories.length} memories in ${batchTime}ms`);
    console.log(`   Average: ${avgBatchTime.toFixed(0)}ms per memory`);
    console.log(`   Throughput: ${(1000 / avgBatchTime).toFixed(1)} inserts/sec`);
    console.log(`   Speedup vs single: ${(avgInsertTime / avgBatchTime).toFixed(1)}x`);
    console.log();

    // Test 6: Final Search with All Memories
    console.log("=".repeat(80));
    console.log("🎯 Test 6: Search with Full Dataset");
    console.log("=".repeat(80));
    console.log();

    const finalQuery = "dietary restrictions and food preferences";
    console.log(`Query: "${finalQuery}"`);
    console.log(`Total memories: ${memories.length + batchMemories.length}`);
    console.log();

    const finalStart = Date.now();
    const finalResults = await axios.post(`${QDRANT_URL}/search`, {
        user_id: userId,
        context: finalQuery,
        domain: 'places',
        limit: 10,
        use_classifiers: true
    });
    const finalTime = Date.now() - finalStart;

    const finalMemories = finalResults.data.memories || [];

    console.log(`⏱️  Search latency: ${finalTime}ms`);
    console.log(`📝 Results: ${finalMemories.length}`);
    console.log();
    console.log("Top results:");
    finalMemories.slice(0, 5).forEach((m: any, i: number) => {
        console.log(`  ${i + 1}. ${m.text}`);
        console.log(`     Score: ${m.score.toFixed(3)} | Classifiers: ${m.classifiers.join(', ')}`);
    });
    console.log();

    // Summary
    console.log("=".repeat(80));
    console.log("📊 PERFORMANCE SUMMARY");
    console.log("=".repeat(80));
    console.log();

    console.log("┌─────────────────────────┬──────────────┬──────────────┐");
    console.log("│ Metric                  │ Value        │ Target       │");
    console.log("├─────────────────────────┼──────────────┼──────────────┤");
    console.log(`│ Single Insert           │ ${avgInsertTime.toFixed(0)}ms${' '.repeat(10 - avgInsertTime.toFixed(0).length)} │ <200ms       │`);
    console.log(`│ Batch Insert (avg)      │ ${avgBatchTime.toFixed(0)}ms${' '.repeat(11 - avgBatchTime.toFixed(0).length)} │ <100ms       │`);
    console.log(`│ Search Latency          │ ${finalTime}ms${' '.repeat(10 - finalTime.toString().length)} │ <200ms       │`);
    console.log(`│ Batch Speedup           │ ${(avgInsertTime / avgBatchTime).toFixed(1)}x${' '.repeat(11 - (avgInsertTime / avgBatchTime).toFixed(1).length)} │ >5x          │`);
    console.log("└─────────────────────────┴──────────────┴──────────────┘");
    console.log();

    const allPassed = avgInsertTime < 200 && avgBatchTime < 100 && finalTime < 200 && (avgInsertTime / avgBatchTime) > 5;

    if (allPassed) {
        console.log("✅ ALL TESTS PASSED - System performing within targets!");
    } else {
        console.log("⚠️  Some metrics outside targets (may be acceptable)");
    }

    console.log();
    console.log("=".repeat(80));
    console.log("TEST COMPLETE");
    console.log("=".repeat(80));
}

main().catch(console.error);
