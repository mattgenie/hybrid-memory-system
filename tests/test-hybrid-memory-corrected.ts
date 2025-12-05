import { HybridMemoryService } from './core/memory/hybrid-memory-service';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
    console.log("=".repeat(60));
    console.log("HYBRID MEMORY SERVICE TEST (CORRECTED ARCHITECTURE)");
    console.log("=".repeat(60));
    console.log();

    const hybrid = new HybridMemoryService();
    const userId = 'hybrid-test-corrected-' + Date.now();

    console.log("📋 ARCHITECTURE:");
    console.log("  1. WRITE → Mem0 only (for extraction)");
    console.log("  2. SYNC → Mirror Mem0's processed memories to Qdrant");
    console.log("  3. READ → Qdrant only (fast!)");
    console.log();

    // Test 1: Add memories (Mem0 only)
    console.log("=".repeat(60));
    console.log("📝 Test 1: Adding memories to Mem0...");
    console.log("=".repeat(60));

    const memories = [
        { text: "I have a severe peanut allergy", topic: 'food' as const, type: 'stable' as const },
        { text: "I love spicy Thai food", topic: 'food' as const, type: 'stable' as const },
        { text: "I am vegetarian", topic: 'food' as const, type: 'stable' as const },
        { text: "I'm craving sushi tonight", topic: 'food' as const, type: 'contextual' as const }
    ];

    for (const mem of memories) {
        await hybrid.addMemory(
            userId,
            [{ role: 'user' as const, content: mem.text }],
            { topic: mem.topic, type: mem.type }
        );
        console.log(`   ✓ Queued: "${mem.text}"`);
        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\n   ✓ Added ${memories.length} memories to Mem0`);
    console.log("   ⏳ Waiting 5s for Mem0's async processing...\n");
    await new Promise(r => setTimeout(r, 5000));

    // Test 2: Sync to Qdrant
    console.log("=".repeat(60));
    console.log("🔄 Test 2: Syncing Mem0 → Qdrant...");
    console.log("=".repeat(60));

    const syncResult = await hybrid.syncUserFromMem0(userId);
    console.log(`\n   ✓ Synced ${syncResult.synced} memories to Qdrant`);
    console.log(`   ✓ Errors: ${syncResult.errors}`);

    // Test 3: Query from Qdrant (fast path)
    console.log("\n" + "=".repeat(60));
    console.log("🔍 Test 3: Querying from Qdrant (fast path)...");
    console.log("=".repeat(60));

    const context = "looking for a place to eat dinner";

    const startTime = Date.now();
    const profile = await hybrid.retrieveParticipantProfile(userId, context, 'places');
    const latency = Date.now() - startTime;

    console.log(`\n   ⚡ Query latency: ${latency}ms`);
    console.log("\n📊 Retrieved Profile:");
    console.log(`   Stable: ${profile.places_preferences?.stable_preferences || 'None'}`);
    console.log(`   Contextual: ${profile.places_preferences?.contextual_preferences || 'None'}`);

    // Test 4: Demonstrate addMemoryAndSync
    console.log("\n" + "=".repeat(60));
    console.log("⚡ Test 4: Using addMemoryAndSync (convenience method)...");
    console.log("=".repeat(60));

    const newMemory = "I hate cilantro";
    console.log(`\n   Adding: "${newMemory}"`);

    const syncResult2 = await hybrid.addMemoryAndSync(
        userId,
        [{ role: 'user' as const, content: newMemory }],
        { topic: 'food', type: 'stable' },
        3000 // Wait 3s for Mem0 processing
    );

    console.log(`   ✓ Synced ${syncResult2.synced} memories (including new one)`);

    // Verify it's in Qdrant
    const profile2 = await hybrid.retrieveParticipantProfile(userId, "food preferences", 'places');
    console.log(`\n   Updated preferences: ${profile2.places_preferences?.stable_preferences || 'None'}`);

    // Analysis
    console.log("\n" + "=".repeat(60));
    console.log("📊 ARCHITECTURE BENEFITS");
    console.log("=".repeat(60));
    console.log("\n✅ Consistency:");
    console.log("   - Mem0 and Qdrant contain the SAME processed memories");
    console.log("   - No mismatch between raw text and extracted facts");
    console.log("\n✅ Quality:");
    console.log("   - Mem0 extracts and rewrites (e.g., 'I have...' → 'User has...')");
    console.log("   - Qdrant gets the cleaned, processed version");
    console.log("\n✅ Performance:");
    console.log(`   - Qdrant queries: ${latency}ms (vs Mem0's ~800ms)`);
    console.log("   - Zero API costs for search");
    console.log("\n✅ Flexibility:");
    console.log("   - Use addMemory() for async sync (background jobs)");
    console.log("   - Use addMemoryAndSync() for immediate availability");

    // Cleanup
    console.log("\n🧹 Cleaning up test user...");
    const { MemoryClient } = await import('mem0ai');
    const client = new MemoryClient({ apiKey: process.env.MEM0_API_KEY || 'dummy' });
    await client.deleteAll({ user_id: userId });
    console.log("✅ Cleanup complete");

    console.log("\n" + "=".repeat(60));
    console.log("TEST COMPLETE");
    console.log("=".repeat(60));
}

main().catch(console.error);
