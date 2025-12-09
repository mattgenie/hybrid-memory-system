import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const QDRANT_URL = 'http://54.145.235.188:8765';

async function main() {
    console.log("=".repeat(80));
    console.log("MULTI-VECTOR SEARCH TEST - WITH LLM CLASSIFIERS");
    console.log("=".repeat(80));
    console.log();

    const userId = 'multi-vector-test-' + Date.now();

    // Check health
    const health = await axios.get(`${QDRANT_URL}/health`);
    console.log("✅ Service Status:", JSON.stringify(health.data));
    console.log();

    // Test memories
    const testMemories = [
        "I have a severe peanut allergy",
        "I love spicy Thai food",
        "I am vegetarian",
        "I hate cilantro",
        "I'm craving sushi tonight",
    ];

    console.log("=".repeat(80));
    console.log("📝 Adding Memories with LLM-Generated Classifiers");
    console.log("=".repeat(80));
    console.log();

    for (const text of testMemories) {
        const response = await axios.post(`${QDRANT_URL}/add_memory`, {
            user_id: userId,
            text: text,
            topic: 'food',
            type: 'stable'
        });

        console.log(`✓ "${text}"`);
        console.log(`  Classifiers: ${JSON.stringify(response.data.classifiers)}`);
        console.log();
    }

    console.log("=".repeat(80));
    console.log("🔍 Testing Multi-Vector Search");
    console.log("=".repeat(80));
    console.log();

    const queries = [
        "looking for a restaurant for dinner",
        "what are my dietary restrictions",
        "food preferences"
    ];

    for (const query of queries) {
        console.log(`Query: "${query}"`);
        console.log();

        // Test WITH classifiers (multi-vector)
        const withStart = Date.now();
        const withClassifiers = await axios.post(`${QDRANT_URL}/search`, {
            user_id: userId,
            context: query,
            domain: 'places',
            limit: 10,
            use_classifiers: true
        });
        const withLatency = Date.now() - withStart;

        // Test WITHOUT classifiers (single vector)
        const withoutStart = Date.now();
        const withoutClassifiers = await axios.post(`${QDRANT_URL}/search`, {
            user_id: userId,
            context: query,
            domain: 'places',
            limit: 10,
            use_classifiers: false
        });
        const withoutLatency = Date.now() - withoutStart;

        const withResults = withClassifiers.data.memories || [];
        const withoutResults = withoutClassifiers.data.memories || [];

        console.log("┌─────────────────────┬──────────────┬──────────────┐");
        console.log("│ Mode                │ Results      │ Latency      │");
        console.log("├─────────────────────┼──────────────┼──────────────┤");
        console.log(`│ Single Vector       │ ${withoutResults.length.toString().padEnd(12)} │ ${withoutLatency}ms${' '.repeat(10 - withoutLatency.toString().length)} │`);
        console.log(`│ Multi-Vector (LLM)  │ ${withResults.length.toString().padEnd(12)} │ ${withLatency}ms${' '.repeat(10 - withLatency.toString().length)} │`);
        console.log("└─────────────────────┴──────────────┴──────────────┘");
        console.log();

        console.log("Results (Multi-Vector):");
        withResults.forEach((r: any, i: number) => {
            console.log(`  ${i + 1}. ${r.text} (score: ${r.score.toFixed(3)})`);
            console.log(`     Classifiers: ${r.classifiers.join(', ')}`);
        });
        console.log();
        console.log("-".repeat(80));
        console.log();
    }

    console.log("=".repeat(80));
    console.log("TEST COMPLETE");
    console.log("=".repeat(80));
}

main().catch(console.error);
