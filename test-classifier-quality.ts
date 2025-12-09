import axios from 'axios';

const CLASSIFIER_URL = 'http://13.220.192.170:8766';

const testCases = [
    "I have a severe peanut allergy",
    "I love spicy Thai food",
    "I am vegetarian",
    "I hate cilantro",
    "I'm craving sushi tonight",
    "My favorite color is blue",
    "I work as a software engineer"
];

async function main() {
    console.log("=".repeat(60));
    console.log("CLASSIFIER QUALITY TEST");
    console.log("=".repeat(60));
    console.log();

    for (const text of testCases) {
        try {
            const response = await axios.post(`${CLASSIFIER_URL}/classify`, {
                text: text
            }, { timeout: 5000 });

            const classifiers = response.data.classifiers;
            console.log(`Text: "${text}"`);
            console.log(`  → ${classifiers.join(', ')}`);

            // Check for bad outputs
            const bad = classifiers.some((c: string) =>
                c.includes('Please') ||
                c.includes('Spanish') ||
                c.includes('?') ||
                c.length > 50
            );

            if (bad) {
                console.log(`  ⚠️  ISSUE: Contains conversational text`);
            } else {
                console.log(`  ✅ Clean`);
            }
            console.log();
        } catch (e: any) {
            console.log(`Text: "${text}"`);
            console.log(`  ❌ Error: ${e.message}`);
            console.log();
        }
    }

    console.log("=".repeat(60));
}

main().catch(console.error);
