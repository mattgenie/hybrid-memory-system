import { MemoryClient } from 'mem0ai';
import * as dotenv from 'dotenv';

dotenv.config();

async function testMem0AddResponse() {
    console.log("=".repeat(60));
    console.log("MEM0 ADD() RESPONSE TEST");
    console.log("=".repeat(60));
    console.log();

    const client = new MemoryClient({ apiKey: process.env.MEM0_API_KEY || 'dummy' });
    const userId = 'add-response-test-user-' + Date.now();

    console.log(`🧪 Testing with user: ${userId}\n`);

    // Test 1: Single simple message
    console.log("📝 Test 1: Adding a simple memory...");
    const messages1 = [
        { role: 'user' as const, content: 'I have a severe peanut allergy' }
    ];

    const result1 = await client.add(messages1, {
        user_id: userId,
        metadata: { topic: 'food', type: 'stable' }
    });

    console.log("\n🔍 Result from client.add():");
    console.log(JSON.stringify(result1, null, 2));
    console.log("\nResult type:", typeof result1);
    console.log("Result keys:", result1 ? Object.keys(result1) : 'null/undefined');

    // Wait a bit for processing
    console.log("\n⏳ Waiting 3s for Mem0 to process...\n");
    await new Promise(r => setTimeout(r, 3000));

    // Test 2: Check what was actually stored
    console.log("🔍 Test 2: Fetching all memories for this user...");
    const allMemories = await client.getAll({ user_id: userId });

    console.log("\n📊 Memories stored in Mem0:");
    console.log(JSON.stringify(allMemories, null, 2));

    // Test 3: Multi-turn conversation
    console.log("\n" + "=".repeat(60));
    console.log("📝 Test 3: Adding a multi-turn conversation...");
    const messages2 = [
        { role: 'user' as const, content: 'I love spicy Thai food' },
        { role: 'assistant' as const, content: 'Great! I can help you find Thai restaurants.' },
        { role: 'user' as const, content: 'But I prefer outdoor seating when possible' }
    ];

    const result2 = await client.add(messages2, {
        user_id: userId,
        metadata: { topic: 'food', type: 'stable' }
    });

    console.log("\n🔍 Result from multi-turn add():");
    console.log(JSON.stringify(result2, null, 2));

    // Wait and check again
    console.log("\n⏳ Waiting 3s for processing...\n");
    await new Promise(r => setTimeout(r, 3000));

    const allMemories2 = await client.getAll({ user_id: userId });
    console.log("📊 All memories after multi-turn:");
    console.log(JSON.stringify(allMemories2, null, 2));

    // Test 4: Search to see what Mem0 extracted
    console.log("\n" + "=".repeat(60));
    console.log("🔍 Test 4: Searching for food-related memories...");

    const searchResults = await client.search('food preferences', {
        user_id: userId,
        limit: 10
    });

    console.log("\n📊 Search results:");
    console.log(JSON.stringify(searchResults, null, 2));

    // Analysis
    console.log("\n" + "=".repeat(60));
    console.log("📊 ANALYSIS");
    console.log("=".repeat(60));

    console.log("\n1. Does add() return extracted memories?");
    console.log(`   ${result1 && (result1 as any).memories ? '✅ YES' : '❌ NO'}`);

    console.log("\n2. Does add() return memory IDs?");
    console.log(`   ${result1 && (result1 as any).id ? '✅ YES' : '❌ NO'}`);

    console.log("\n3. What does add() actually return?");
    if (result1) {
        const keys = Object.keys(result1);
        console.log(`   Keys: ${keys.join(', ')}`);
        console.log(`   Full object:`, result1);
    }

    console.log("\n4. How many memories did Mem0 extract from 2 inputs?");
    console.log(`   Input count: 2 (peanut allergy + Thai food conversation)`);
    console.log(`   Stored count: ${allMemories2?.length || 0}`);

    if (allMemories2 && allMemories2.length > 0) {
        console.log("\n5. What do the extracted memories look like?");
        allMemories2.forEach((mem: any, idx: number) => {
            console.log(`\n   Memory ${idx + 1}:`);
            console.log(`   - ID: ${mem.id}`);
            console.log(`   - Text: "${mem.memory}"`);
            console.log(`   - Metadata:`, mem.metadata);
        });
    }

    // Cleanup
    console.log("\n🧹 Cleaning up test user...");
    await client.deleteAll({ user_id: userId });
    console.log("✅ Cleanup complete");

    console.log("\n" + "=".repeat(60));
    console.log("TEST COMPLETE");
    console.log("=".repeat(60));
}

testMem0AddResponse().catch(console.error);
