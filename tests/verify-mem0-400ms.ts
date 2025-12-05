import { Mem0Service } from '../../src/core/memory/mem0-service';
import * as dotenv from 'dotenv';
import { performance } from 'perf_hooks';

dotenv.config({ override: true });

async function verifyMem0PerformanceTarget() {
    console.log("=== Verifying Mem0 400ms Performance Target ===\n");

    const mem0 = new Mem0Service();
    const userId = `perf_test_${Date.now()}`;

    console.log("--- Step 1: Creating Diverse Memory Set ---");

    // Add 10 food memories
    const foodMemories = [
        "I'm allergic to peanuts and shellfish",
        "I love Italian restaurants with authentic pasta",
        "My favorite cuisine is Japanese, especially sushi and ramen",
        "I prefer vegetarian options when available",
        "I can't eat dairy products due to lactose intolerance",
        "Mexican food is my go-to for spicy cravings",
        "I enjoy fine dining restaurants for special occasions",
        "Thai food is amazing, particularly pad thai and green curry",
        "I like Mediterranean food, especially Greek and Lebanese",
        "Coffee shops with good espresso are important to me"
    ];

    // Add 10 movie memories
    const movieMemories = [
        "I love Christopher Nolan films, especially Inception and Interstellar",
        "Sci-fi movies are my favorite genre",
        "I enjoy thriller and mystery films with plot twists",
        "Marvel movies are entertaining but not my top choice",
        "I prefer movies with strong character development",
        "Foreign films and indie cinema are often better than blockbusters",
        "I can't stand horror movies, they give me nightmares",
        "Documentaries about science and nature fascinate me",
        "Classic films from the 80s and 90s have a special charm",
        "I appreciate good cinematography and soundtrack in films"
    ];

    // Add 10 music memories
    const musicMemories = [
        "I listen to jazz music when I'm working or studying",
        "Classical piano concerts are my favorite live performances",
        "I enjoy indie rock bands and alternative music",
        "EDM and electronic music are great for workouts",
        "I can't stand country music, just not my style",
        "Hip hop from the 90s era is nostalgic for me",
        "Acoustic singer-songwriter music helps me relax",
        "I love discovering new artists on Spotify playlists",
        "Concert halls with good acoustics enhance the experience",
        "I prefer albums over single tracks for a cohesive listening experience"
    ];

    console.log(`Adding ${foodMemories.length} food memories...`);
    for (const memory of foodMemories) {
        await mem0.addMemory(userId, memory, 'food');
    }

    console.log(`Adding ${movieMemories.length} movie memories...`);
    for (const memory of movieMemories) {
        await mem0.addMemory(userId, memory, 'movies');
    }

    console.log(`Adding ${musicMemories.length} music memories...`);
    for (const memory of musicMemories) {
        await mem0.addMemory(userId, memory, 'music');
    }

    console.log(`\nTotal memories added: ${foodMemories.length + movieMemories.length + musicMemories.length}`);
    console.log("\n--- Step 2: Waiting for Mem0 Indexing (5 seconds) ---");
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log("\n--- Step 3: Running Filtered Searches with Latency Measurement ---\n");

    // Test 1: Food search with filters
    console.log("Test 1: Food preferences search (with metadata.topic filter)");
    let start = performance.now();
    const profile1 = await mem0.retrieveParticipantProfile(userId, "What are my food preferences?", 'places');
    let end = performance.now();
    const foodLatency = end - start;
    console.log(`  Latency: ${foodLatency.toFixed(0)}ms`);
    console.log(`  Found: ${profile1.places_preferences?.stable_preferences?.split(';').length || 0} preferences`);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 2: Movie search with filters
    console.log("\nTest 2: Movie preferences search (with metadata.topic filter)");
    start = performance.now();
    const profile2 = await mem0.retrieveParticipantProfile(userId, "What movies do I like?", 'movies');
    end = performance.now();
    const movieLatency = end - start;
    console.log(`  Latency: ${movieLatency.toFixed(0)}ms`);
    console.log(`  Found: ${profile2.movies_preferences?.stable_preferences?.split(';').length || 0} preferences`);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 3: Music search with filters
    console.log("\nTest 3: Music preferences search (with metadata.topic filter)");
    start = performance.now();
    const profile3 = await mem0.retrieveParticipantProfile(userId, "What music do I like?", 'music');
    end = performance.now();
    const musicLatency = end - start;
    console.log(`  Latency: ${musicLatency.toFixed(0)}ms`);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 4: Cached search (should be fastest)
    console.log("\nTest 4: Cached search (stable preferences cached)");
    start = performance.now();
    const profile4 = await mem0.retrieveParticipantProfile(userId, "Find me Italian restaurants", 'places');
    end = performance.now();
    const cachedLatency = end - start;
    console.log(`  Latency: ${cachedLatency.toFixed(0)}ms (should be ~400ms with just contextual query)`);

    // Analysis
    console.log("\n--- Performance Analysis ---");
    const avgLatency = (foodLatency + movieLatency + musicLatency) / 3;
    console.log(`Average latency (first requests): ${avgLatency.toFixed(0)}ms`);
    console.log(`Cached request latency: ${cachedLatency.toFixed(0)}ms`);
    console.log(`Target latency: ~400ms (from documentation)`);

    const percentOfTarget = (cachedLatency / 400) * 100;
    console.log(`\nCached performance: ${percentOfTarget.toFixed(0)}% of target`);

    if (cachedLatency <= 500) {
        console.log("✅ EXCELLENT: Cached searches are within acceptable range!");
    } else if (cachedLatency <= 1000) {
        console.log("⚠️ ACCEPTABLE: Cached searches are slower than target but usable");
    } else {
        console.log("❌ NEEDS IMPROVEMENT: Cached searches are significantly slower than target");
    }

    console.log("\nNote: Latency depends on:");
    console.log("  - Network latency to Mem0 servers");
    console.log("  - Number of memories in database");
    console.log("  - Mem0 plan tier (managed vs self-hosted)");
    console.log("  - Metadata indexing completion");
}

verifyMem0PerformanceTarget().catch(console.error);
