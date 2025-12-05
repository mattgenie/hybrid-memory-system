import { MemoryClient } from 'mem0ai';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
    console.log("Debug: Starting Mem0 Rerank Test");
    const client = new MemoryClient({ apiKey: process.env.MEM0_API_KEY || 'dummy' });
    const userId = 'debug-rerank-user';

    try {
        console.log("Debug: Adding memory...");
        await client.add([{ role: 'user', content: "I love coding" }], { user_id: userId });
        console.log("Debug: Memory added. Waiting 2s...");
        await new Promise(r => setTimeout(r, 2000));

        console.log("Debug: Searching with rerank: true...");
        const resultsTrue = await client.search("coding", {
            user_id: userId,
            rerank: true,
            limit: 1
        });
        console.log("Results (rerank: true):", JSON.stringify(resultsTrue, null, 2));

        console.log("Debug: Searching with rerank: false...");
        const resultsFalse = await client.search("coding", {
            user_id: userId,
            rerank: false,
            limit: 1
        });
        console.log("Results (rerank: false):", JSON.stringify(resultsFalse, null, 2));

    } catch (error) {
        console.error("Debug: Error occurred:", error);
    }
}

main().catch(console.error);
