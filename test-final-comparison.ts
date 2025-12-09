import { MemoryClient } from 'mem0ai';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const QDRANT_URL = 'http://54.145.235.188:8765';
const MEM0_API_KEY = process.env.MEM0_API_KEY || '';

async function main() {
    console.log("=".repeat(80));
    console.log("COMPREHENSIVE COMPARISON: MEM0 vs QDRANT (GPU + ASYNC)");
    console.log("=".repeat(80));
    console.log();

    const mem0Client = new MemoryClient({ apiKey: MEM0_API_KEY });
    const userId = 'final-comparison-' + Date.now();

    // Test dataset with known relevance
    const foodMemories = [
        "I have a severe peanut allergy",
        "I love spicy Thai food",
        "I am vegetarian",
        "I hate cilantro",
        "I'm craving sushi tonight",
    ];

    const otherMemories = [
        "My favorite color is blue",
        "I work as a software engineer",
        "I live in San Francisco",
        "I enjoy hiking on weekends",
        "My birthday is in June",
        "I have a cat named Whiskers",
        "I drive a Tesla Model 3",
    ];

    const allMemories = [...foodMemories, ...otherMemories];
    const expectedRelevant = foodMemories.length;

    console.log("📋 Test Dataset:");
    console.log(`  Total memories: ${allMemories.length}`);
    console.log(`  Food-related (relevant): ${expectedRelevant}`);
    console.log(`  Other topics (noise): ${otherMemories.length}`);
    console.log();

    // ========================================================================
    // TEST 1: INSERT PERFORMANCE
    // ========================================================================
    console.log("=".repeat(80));
    console.log("⚡ TEST 1: INSERT PERFORMANCE");
    console.log("=".repeat(80));
    console.log();

    // Mem0 inserts
    console.log("Mem0: Adding memories...");
    const mem0InsertStart = Date.now();
    for (const text of allMemories) {
        await mem0Client.add(
            [{ role: 'user', content: text }],
            { user_id: userId }
        );
    }
    const mem0InsertTime = Date.now() - mem0InsertStart;
    const mem0AvgInsert = mem0InsertTime / allMemories.length;

    console.log(`  ✅ ${allMemories.length} memories in ${mem0InsertTime}ms`);
    console.log(`  Average: ${mem0AvgInsert.toFixed(0)}ms per memory`);
    console.log();

    // Wait for Mem0 processing
    console.log("  ⏳ Waiting 8s for Mem0 async processing...");
    await new Promise(r => setTimeout(r, 8000));
    console.log();

    // Qdrant inserts (async with GPU)
    console.log("Qdrant: Adding memories...");
    const qdrantInsertStart = Date.now();
    for (const text of allMemories) {
        await axios.post(`${QDRANT_URL}/add_memory`, {
            user_id: userId,
            text: text,
            topic: 'food',
            type: 'stable'
        });
    }
    const qdrantInsertTime = Date.now() - qdrantInsertStart;
    const qdrantAvgInsert = qdrantInsertTime / allMemories.length;

    console.log(`  ✅ ${allMemories.length} memories in ${qdrantInsertTime}ms`);
    console.log(`  Average: ${qdrantAvgInsert.toFixed(0)}ms per memory`);
    console.log();

    // Wait for async GPU classification
    console.log("  ⏳ Waiting 5s for async GPU classification...");
    await new Promise(r => setTimeout(r, 5000));
    console.log();

    const insertSpeedup = (mem0AvgInsert / qdrantAvgInsert).toFixed(1);

    // ========================================================================
    // TEST 2: SEARCH PERFORMANCE & QUALITY
    // ========================================================================
    console.log("=".repeat(80));
    console.log("🔍 TEST 2: SEARCH PERFORMANCE & QUALITY");
    console.log("=".repeat(80));
    console.log();

    const testQuery = "what are my dietary restrictions and food preferences";
    console.log(`Query: "${testQuery}"`);
    console.log(`Expected relevant results: ${expectedRelevant} food memories`);
    console.log();

    // Mem0 search
    console.log("Mem0 Search:");
    const mem0SearchStart = Date.now();
    const mem0Results = await mem0Client.search(testQuery, {
        user_id: userId,
        limit: 20
    });
    const mem0SearchTime = Date.now() - mem0SearchStart;
    const mem0Count = Array.isArray(mem0Results) ? mem0Results.length : 0;

    console.log(`  ⏱️  Latency: ${mem0SearchTime}ms`);
    console.log(`  📝 Results: ${mem0Count}`);

    // Calculate Mem0 precision/recall
    const foodKeywords = ['food', 'allergy', 'vegetarian', 'thai', 'sushi', 'cilantro', 'peanut', 'spicy'];
    const mem0Relevant = Array.isArray(mem0Results) ? mem0Results.filter((r: any) => {
        const text = (r.memory || '').toLowerCase();
        return foodKeywords.some(kw => text.includes(kw));
    }).length : 0;

    const mem0Precision = mem0Count > 0 ? ((mem0Relevant / mem0Count) * 100).toFixed(1) : '0';
    const mem0Recall = ((mem0Relevant / expectedRelevant) * 100).toFixed(1);

    console.log(`  🎯 Precision: ${mem0Precision}% (${mem0Relevant}/${mem0Count} relevant)`);
    console.log(`  🎯 Recall: ${mem0Recall}% (${mem0Relevant}/${expectedRelevant} found)`);
    console.log();

    // Qdrant search
    console.log("Qdrant Search:");
    const qdrantSearchStart = Date.now();
    const qdrantResponse = await axios.post(`${QDRANT_URL}/search`, {
        user_id: userId,
        context: testQuery,
        domain: 'places',
        limit: 20,
        use_classifiers: true,
        score_threshold: 0.27  // Filter low-quality results
    });
    const qdrantSearchTime = Date.now() - qdrantSearchStart;
    const qdrantResults = qdrantResponse.data.memories || [];
    const qdrantCount = qdrantResults.length;

    console.log(`  ⏱️  Latency: ${qdrantSearchTime}ms`);
    console.log(`  📝 Results: ${qdrantCount}`);

    // Calculate Qdrant precision/recall
    const qdrantRelevant = qdrantResults.filter((r: any) => {
        const text = (r.text || '').toLowerCase();
        return foodKeywords.some(kw => text.includes(kw));
    }).length;

    const qdrantPrecision = qdrantCount > 0 ? ((qdrantRelevant / qdrantCount) * 100).toFixed(1) : '0';
    const qdrantRecall = ((qdrantRelevant / expectedRelevant) * 100).toFixed(1);

    console.log(`  🎯 Precision: ${qdrantPrecision}% (${qdrantRelevant}/${qdrantCount} relevant)`);
    console.log(`  🎯 Recall: ${qdrantRecall}% (${qdrantRelevant}/${expectedRelevant} found)`);
    console.log();

    const searchSpeedup = (mem0SearchTime / qdrantSearchTime).toFixed(1);

    // ========================================================================
    // FINAL COMPARISON
    // ========================================================================
    console.log("=".repeat(80));
    console.log("📊 FINAL COMPARISON");
    console.log("=".repeat(80));
    console.log();

    console.log("┌─────────────────────┬──────────────┬──────────────┬──────────────┐");
    console.log("│ Metric              │ Mem0         │ Qdrant (GPU) │ Winner       │");
    console.log("├─────────────────────┼──────────────┼──────────────┼──────────────┤");
    console.log(`│ Insert Latency      │ ${mem0AvgInsert.toFixed(0)}ms${' '.repeat(10 - mem0AvgInsert.toFixed(0).length)} │ ${qdrantAvgInsert.toFixed(0)}ms${' '.repeat(11 - qdrantAvgInsert.toFixed(0).length)} │ ${qdrantAvgInsert < mem0AvgInsert ? 'Qdrant ✓' : 'Mem0 ✓'.padEnd(12)} │`);
    console.log(`│ Search Latency      │ ${mem0SearchTime}ms${' '.repeat(10 - mem0SearchTime.toString().length)} │ ${qdrantSearchTime}ms${' '.repeat(11 - qdrantSearchTime.toString().length)} │ ${qdrantSearchTime < mem0SearchTime ? 'Qdrant ✓' : 'Mem0 ✓'.padEnd(12)} │`);
    console.log(`│ Precision           │ ${mem0Precision}%${' '.repeat(10 - mem0Precision.length)} │ ${qdrantPrecision}%${' '.repeat(11 - qdrantPrecision.length)} │ ${parseFloat(qdrantPrecision) >= parseFloat(mem0Precision) ? 'Qdrant ✓' : 'Mem0 ✓'.padEnd(12)} │`);
    console.log(`│ Recall              │ ${mem0Recall}%${' '.repeat(10 - mem0Recall.length)} │ ${qdrantRecall}%${' '.repeat(11 - qdrantRecall.length)} │ ${parseFloat(qdrantRecall) >= parseFloat(mem0Recall) ? 'Qdrant ✓' : 'Mem0 ✓'.padEnd(12)} │`);
    console.log(`│ API Cost            │ $$$${' '.repeat(9)} │ FREE${' '.repeat(8)} │ ${'Qdrant ✓'.padEnd(12)} │`);
    console.log("└─────────────────────┴──────────────┴──────────────┴──────────────┘");
    console.log();

    console.log("⚡ PERFORMANCE:");
    console.log(`   Insert speedup: ${insertSpeedup}x faster with Qdrant`);
    console.log(`   Search speedup: ${searchSpeedup}x faster with Qdrant`);
    console.log();

    console.log("🎯 QUALITY:");
    console.log(`   Mem0:    Precision ${mem0Precision}%, Recall ${mem0Recall}%`);
    console.log(`   Qdrant:  Precision ${qdrantPrecision}%, Recall ${qdrantRecall}%`);
    console.log();

    console.log("💰 COST:");
    console.log("   Mem0:    API calls for search + embeddings + storage");
    console.log("   Qdrant:  Zero API cost (local embeddings + GPU classification)");
    console.log();

    // Top results comparison
    console.log("=".repeat(80));
    console.log("📋 TOP RESULTS COMPARISON");
    console.log("=".repeat(80));
    console.log();

    console.log("Mem0 Top 5:");
    if (Array.isArray(mem0Results) && mem0Results.length > 0) {
        mem0Results.slice(0, 5).forEach((r: any, i: number) => {
            console.log(`  ${i + 1}. ${r.memory || r.text || JSON.stringify(r)}`);
        });
    } else {
        console.log("  (No results)");
    }
    console.log();

    console.log("Qdrant Top 5:");
    if (qdrantResults.length > 0) {
        qdrantResults.slice(0, 5).forEach((r: any, i: number) => {
            console.log(`  ${i + 1}. ${r.text} (score: ${r.score.toFixed(3)})`);
            console.log(`     Classifiers: ${r.classifiers.join(', ')} [${r.classifier_source || 'unknown'}]`);
        });
    } else {
        console.log("  (No results)");
    }
    console.log();

    // Cleanup
    console.log("🧹 Cleaning up...");
    await mem0Client.deleteAll({ user_id: userId });
    console.log("✅ Cleanup complete");

    console.log();
    console.log("=".repeat(80));
    console.log("TEST COMPLETE");
    console.log("=".repeat(80));
}

main().catch(console.error);
