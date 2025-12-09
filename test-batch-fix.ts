import axios from 'axios';

const QDRANT_URL = 'http://54.145.235.188:8765';

async function main() {
    console.log("=".repeat(60));
    console.log("BATCH PERFORMANCE TEST - VERIFYING FIX");
    console.log("=".repeat(60));
    console.log();

    const userId = 'batch-fix-test-' + Date.now();

    const memories = [
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

    console.log(`Batch inserting ${memories.length} memories...`);
    console.log();

    const start = Date.now();

    await axios.post(`${QDRANT_URL}/add_memories_batch`, {
        memories: memories.map(text => ({
            user_id: userId,
            text: text,
            topic: 'food',
            type: 'stable'
        }))
    });

    const elapsed = Date.now() - start;
    const avgTime = elapsed / memories.length;

    console.log("=".repeat(60));
    console.log("RESULTS");
    console.log("=".repeat(60));
    console.log();
    console.log(`✅ Batch inserted ${memories.length} memories`);
    console.log(`   Total time: ${elapsed}ms`);
    console.log(`   Average per item: ${avgTime.toFixed(0)}ms`);
    console.log(`   Throughput: ${(1000 / avgTime).toFixed(1)} inserts/sec`);
    console.log();

    // Expected performance
    const expected = 820; // ms per item
    const tolerance = 300; // ms

    if (avgTime <= expected + tolerance) {
        console.log(`✅ PASS: Within expected range (~${expected}ms ± ${tolerance}ms)`);
    } else {
        console.log(`⚠️  SLOWER: Expected ~${expected}ms, got ${avgTime.toFixed(0)}ms`);
    }

    console.log();
    console.log("=".repeat(60));
}

main().catch(console.error);
