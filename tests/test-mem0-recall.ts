import { Mem0Service } from './core/memory/mem0-service';
import { MemoryClient } from 'mem0ai';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
    console.log("=".repeat(60));
    console.log("MEM0 RECALL & PRECISION TEST");
    console.log("=".repeat(60));
    console.log();

    const mem0Service = new Mem0Service();
    const client = new MemoryClient({ apiKey: process.env.MEM0_API_KEY || 'dummy' });
    const userId = 'recall-test-user-001';

    // 1. Cleanup
    console.log("🧹 Cleaning up previous test data...");
    try {
        await client.deleteAll({ user_id: userId });
        console.log("   ✓ Cleanup complete\n");
    } catch (e) {
        console.log("   ⚠️  Cleanup skipped (no existing data)\n");
    }

    // 2. Seed Data
    console.log("📝 Seeding memories...");

    // 10 Relevant Memories (Food/Dining)
    const relevantMemories = [
        "I have a severe peanut allergy",
        "I love spicy Thai food",
        "I am vegetarian",
        "I prefer outdoor seating",
        "I hate cilantro",
        "I love sushi for dinner",
        "I avoid gluten when possible",
        "I like Italian cuisine",
        "I prefer quiet restaurants",
        "I love trying new dessert places"
    ];

    // 20 Irrelevant Memories (Noise)
    const irrelevantMemories = [
        "I love Christopher Nolan movies",
        "I hate horror movies",
        "My favorite color is blue",
        "I play the guitar",
        "The sky is blue",
        "I need to buy groceries",
        "My cat's name is Whiskers",
        "I work as a software engineer",
        "I enjoy hiking on weekends",
        "I drive a Honda Civic",
        "I listen to jazz music",
        "I want to travel to Japan",
        "I read science fiction books",
        "I drink coffee every morning",
        "I exercise three times a week",
        "My phone battery is low",
        "I need to pay my bills",
        "I watched a documentary yesterday",
        "I like coding in TypeScript",
        "I prefer dark mode on my computer"
    ];

    const allMemories = [...relevantMemories, ...irrelevantMemories];

    // Shuffle to ensure distribution isn't just sequential
    for (let i = allMemories.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allMemories[i], allMemories[j]] = [allMemories[j], allMemories[i]];
    }

    const seedStart = Date.now();
    for (const mem of allMemories) {
        await client.add([{ role: 'user', content: mem }], { user_id: userId });
        // Small delay to prevent rate limits
        await new Promise(r => setTimeout(r, 200));
    }
    console.log(`   ✓ Seeded ${allMemories.length} memories (10 relevant, 20 irrelevant)`);
    console.log("   ⏳ Waiting 10s for indexing...\n");
    await new Promise(r => setTimeout(r, 10000));

    // 3. Execute Search
    console.log("🔍 Executing Search...");
    const context = "looking for a place to eat dinner";

    // Use 'places' domain as per optimization
    const profile = await mem0Service.retrieveParticipantProfile(userId, context, 'places');

    // 4. Analyze Results
    console.log("\n" + "=".repeat(60));
    console.log("RESULTS ANALYSIS");
    console.log("=".repeat(60));

    // Combine all retrieved memories from stable and contextual
    const retrievedSet = new Set<string>();

    if (profile.stable_traits) {
        profile.stable_traits.split("; ").forEach(m => retrievedSet.add(m.trim()));
    }
    if (profile.places_preferences?.stable_preferences) {
        profile.places_preferences.stable_preferences.split("; ").forEach(m => retrievedSet.add(m.trim()));
    }
    if (profile.places_preferences?.contextual_preferences) {
        profile.places_preferences.contextual_preferences.split("; ").forEach(m => retrievedSet.add(m.trim()));
    }

    const retrieved = Array.from(retrievedSet);

    console.log(`\nTotal Unique Memories Retrieved: ${retrieved.length}`);
    console.log("Retrieved Memories:");
    retrieved.forEach(m => console.log(` - ${m}`));

    // Calculate Metrics
    let truePositives = 0;
    let falsePositives = 0;

    // Define keywords for relevant memories to handle text rewriting
    const relevantKeywords = [
        "peanut", "Thai", "vegetarian", "outdoor", "cilantro",
        "sushi", "gluten", "Italian", "quiet", "dessert"
    ];

    retrieved.forEach(mem => {
        const lowerMem = mem.toLowerCase();
        // Check if memory contains any relevant keyword
        const isRelevant = relevantKeywords.some(k => lowerMem.includes(k.toLowerCase()));

        if (isRelevant) {
            truePositives++;
        } else {
            // Double check against irrelevant list to be sure
            const isExplicitlyIrrelevant = irrelevantMemories.some(irm => {
                // Simple overlap check
                const words = irm.toLowerCase().split(' ').filter(w => w.length > 4);
                return words.some(w => lowerMem.includes(w));
            });

            if (isExplicitlyIrrelevant) {
                falsePositives++;
                console.log(`   ❌ Irrelevant: "${mem}"`);
            } else if (mem.toLowerCase().includes("groceries")) {
                // Groceries is borderline, count as irrelevant for "dinner" context
                falsePositives++;
                console.log(`   ❌ Irrelevant (Groceries): "${mem}"`);
            } else {
                // Might be a hallucination or a rewrite we missed
                console.log(`   ❓ Unknown/Hallucinated: "${mem}"`);
                falsePositives++;
            }
        }
    });

    const recall = truePositives / relevantMemories.length;
    const precision = truePositives / (truePositives + falsePositives || 1);

    console.log("\n" + "=".repeat(60));
    console.log("METRICS");
    console.log("=".repeat(60));
    console.log(`Relevant Memories Seeded: ${relevantMemories.length}`);
    console.log(`Irrelevant Memories Seeded: ${irrelevantMemories.length}`);
    console.log(`Retrieved: ${retrieved.length}`);
    console.log(`True Positives: ${truePositives}`);
    console.log(`False Positives: ${falsePositives}`);
    console.log();
    console.log(`Recall: ${(recall * 100).toFixed(1)}%`);
    console.log(`Precision: ${(precision * 100).toFixed(1)}%`);
    console.log();

    if (recall < 0.5) {
        console.log("⚠️  LOW RECALL: We are missing many relevant memories.");
        console.log("    Possible causes: Limit too low, strict filtering, or vector search miss.");
    }
}

main().catch(console.error);
