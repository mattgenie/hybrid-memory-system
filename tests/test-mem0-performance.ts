import { Mem0Service } from './core/memory/mem0-service';
import { MemoryClient } from 'mem0ai';
import * as dotenv from 'dotenv';

dotenv.config();

interface TestResult {
    testName: string;
    passed: boolean;
    latencyMs: number;
    details: string;
}

async function main() {
    console.log("=".repeat(60));
    console.log("MEM0 PERFORMANCE & COVERAGE TEST");
    console.log("=".repeat(60));
    console.log();

    const results: TestResult[] = [];
    const mem0Service = new Mem0Service();
    const client = new MemoryClient({ apiKey: process.env.MEM0_API_KEY || 'dummy' });
    const userId = 'perf-test-user-001';

    // 1. Cleanup
    console.log("🧹 Cleaning up previous test data...");
    try {
        await client.deleteAll({ user_id: userId });
        console.log("   ✓ Cleanup complete\n");
    } catch (e) {
        console.log("   ⚠️  Cleanup skipped (no existing data)\n");
    }

    // 2. Seed comprehensive test data
    console.log("📝 Seeding test memories...");
    const testMemories = [
        // Food preferences (stable)
        "I have a severe peanut allergy",
        "I'm vegetarian and don't eat meat",
        "I love spicy Thai food",

        // Movie preferences (stable)
        "I love Christopher Nolan movies",
        "I hate horror movies",

        // Contextual preferences
        "I'm craving sushi for dinner tonight",
        "I want to try that new Italian restaurant downtown",

        // Location preferences
        "I prefer restaurants in the Mission district",
        "I like places with outdoor seating",

        // Noise/unrelated
        "My cousin Bob likes country music",
        "The sky is blue today",
        "I need to buy groceries tomorrow"
    ];

    const seedStart = Date.now();
    for (const mem of testMemories) {
        await client.add([{ role: 'user', content: mem }], { user_id: userId });
        await new Promise(r => setTimeout(r, 500)); // Reduced delay
    }
    const seedLatency = Date.now() - seedStart;
    console.log(`   ✓ Seeded ${testMemories.length} memories in ${seedLatency}ms`);
    console.log("   ⏳ Waiting 5s for indexing...\n");
    await new Promise(r => setTimeout(r, 5000));

    // 3. Test Cases
    console.log("🧪 Running test cases...\n");

    // Test 1: Basic retrieval latency
    const context1 = "looking for a place to eat dinner";
    const t1Start = Date.now();
    // Use 'places' domain to optimize query count (4 -> 2 calls)
    const profile1 = await mem0Service.retrieveParticipantProfile(userId, context1, 'places');
    const t1Latency = Date.now() - t1Start;

    const hasPeanutAllergy = (profile1.stable_traits || "").toLowerCase().includes("peanut");
    results.push({
        testName: "Stable Preference: Peanut Allergy",
        passed: hasPeanutAllergy,
        latencyMs: t1Latency,
        details: hasPeanutAllergy ? "Found in stable_traits" : "Missing from stable_traits"
    });

    const hasVegetarian = (profile1.stable_traits || "").toLowerCase().includes("vegetarian");
    results.push({
        testName: "Stable Preference: Vegetarian",
        passed: hasVegetarian,
        latencyMs: t1Latency,
        details: hasVegetarian ? "Found in stable_traits" : "Missing from stable_traits"
    });

    const hasSpicy = (profile1.stable_traits || profile1.places_preferences?.stable_preferences || "").toLowerCase().includes("spicy");
    results.push({
        testName: "Food Preference: Spicy Thai",
        passed: hasSpicy,
        latencyMs: t1Latency,
        details: hasSpicy ? "Found in preferences" : "Missing from preferences"
    });

    // Test 2: Domain-specific extraction
    const placesPrefs = profile1.places_preferences?.stable_preferences || "";
    const hasOutdoorSeating = placesPrefs.toLowerCase().includes("outdoor");
    results.push({
        testName: "Location Feature: Outdoor Seating",
        passed: hasOutdoorSeating,
        latencyMs: t1Latency,
        details: hasOutdoorSeating ? "Found in places preferences" : "Missing from places preferences"
    });

    const hasMission = placesPrefs.toLowerCase().includes("mission");
    results.push({
        testName: "Location Preference: Mission District",
        passed: hasMission,
        latencyMs: t1Latency,
        details: hasMission ? "Found in places preferences" : "Missing from places preferences"
    });

    // Test 3: Noise filtering
    const hasBob = (profile1.stable_traits + placesPrefs).includes("Bob");
    results.push({
        testName: "Noise Filtering: Bob's Music",
        passed: !hasBob,
        latencyMs: t1Latency,
        details: hasBob ? "FAIL: Noise leaked into profile" : "Correctly filtered out"
    });

    // Test 4: Movie domain (different context)
    const context2 = "looking for a movie to watch";
    const t2Start = Date.now();
    // Use 'movies' domain to optimize query count
    const profile2 = await mem0Service.retrieveParticipantProfile(userId, context2, 'movies');
    const t2Latency = Date.now() - t2Start;

    const moviePrefs = profile2.movies_preferences?.stable_preferences || "";
    const hasNolan = moviePrefs.toLowerCase().includes("nolan");
    results.push({
        testName: "Movie Preference: Christopher Nolan",
        passed: hasNolan,
        latencyMs: t2Latency,
        details: hasNolan ? "Found in movies preferences" : "Missing from movies preferences"
    });

    const hasHorror = moviePrefs.toLowerCase().includes("horror");
    results.push({
        testName: "Movie Dislike: Horror",
        passed: hasHorror,
        latencyMs: t2Latency,
        details: hasHorror ? "Found in movies preferences" : "Missing from movies preferences"
    });

    // Test 5: Contextual preferences
    const contextualPrefs = profile1.places_preferences?.contextual_preferences || "";
    const hasSushi = contextualPrefs.toLowerCase().includes("sushi");
    results.push({
        testName: "Contextual: Sushi Craving",
        passed: hasSushi,
        latencyMs: t1Latency,
        details: hasSushi ? "Found in contextual preferences" : "Missing (may need keyword tuning)"
    });

    // 4. Print Results
    console.log("\n" + "=".repeat(60));
    console.log("TEST RESULTS");
    console.log("=".repeat(60));
    console.log();

    let passed = 0;
    let failed = 0;
    const latencies: number[] = [];

    for (const result of results) {
        const icon = result.passed ? "✅" : "❌";
        console.log(`${icon} ${result.testName}`);
        console.log(`   Latency: ${result.latencyMs}ms`);
        console.log(`   ${result.details}`);
        console.log();

        if (result.passed) passed++;
        else failed++;
        latencies.push(result.latencyMs);
    }

    // 5. Summary Statistics
    console.log("=".repeat(60));
    console.log("SUMMARY");
    console.log("=".repeat(60));
    console.log();
    console.log(`Tests Passed: ${passed}/${results.length} (${(passed / results.length * 100).toFixed(1)}%)`);
    console.log(`Tests Failed: ${failed}/${results.length}`);
    console.log();
    console.log("Latency Statistics:");
    console.log(`  Seed Time: ${seedLatency}ms for ${testMemories.length} memories`);
    console.log(`  Avg Query Latency: ${(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(0)}ms`);
    console.log(`  Min Query Latency: ${Math.min(...latencies)}ms`);
    console.log(`  Max Query Latency: ${Math.max(...latencies)}ms`);
    console.log();

    // 6. Full Profile Dump
    console.log("=".repeat(60));
    console.log("FULL PROFILE DATA");
    console.log("=".repeat(60));
    console.log();
    console.log("Context: 'looking for a place to eat dinner'");
    console.log(JSON.stringify(profile1, null, 2));
    console.log();
    console.log("Context: 'looking for a movie to watch'");
    console.log(JSON.stringify(profile2, null, 2));

    // Save results
    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            total_tests: results.length,
            passed,
            failed,
            pass_rate: passed / results.length,
            seed_latency_ms: seedLatency,
            avg_query_latency_ms: latencies.reduce((a, b) => a + b, 0) / latencies.length,
            min_query_latency_ms: Math.min(...latencies),
            max_query_latency_ms: Math.max(...latencies)
        },
        test_results: results,
        profiles: {
            dinner_context: profile1,
            movie_context: profile2
        }
    };

    const fs = require('fs');
    fs.writeFileSync('mem0_test_report.json', JSON.stringify(report, null, 2));
    console.log("\n📊 Full report saved to: mem0_test_report.json");
}

main().catch(console.error);
