import { ChatGroq } from "@langchain/groq";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export async function generateCacheConfig(description: string) {
  const apiKeyStr = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_LLM_MODEL;
  
  if (!apiKeyStr || !model) {
    throw new Error("Missing environment variables: GROQ_API_KEY or GROQ_LLM_MODEL");
  }

  const apiKeys = apiKeyStr.split(',').map(k => k.trim()).filter(k => k.length > 0);
  const apiKey = apiKeys[0]; // Simple selection for now

  const llm = new ChatGroq({ apiKey, model, temperature: 0, maxTokens: 1000 });

  const prompt = new SystemMessage(
    `You are an expert system architecture AI. Given a description for a Redis cache, generate a structured configuration.
    
    Output JSON ONLY. No markdown, no prose.
    The JSON must contain these exact keys:
    - namespace (e.g. "user:profile")
    - keyPattern (e.g. "user:{id}")
    - ttl (e.g. "3600s" or "Never")
    - cacheStrategy ("Cache Aside", "Read Through", "Write Through", "Write Behind", "Refresh Ahead")
    - sourceOfTruth (e.g. "Postgres.users", "API", "MongoDB")
    - invalidationRules (e.g. "On profile update")
    - serialization ("JSON", "MessagePack", "ProtoBuf", "String", "Binary")
    - cacheEviction ("volatile-lru", "allkeys-lru", "volatile-lfu", "allkeys-lfu", "noeviction")
    - replication ("Standalone", "Primary/Replica", "Redis Cluster")
    - persistence ("None", "RDB", "AOF")
    - compression ("None", "gzip", "brotli", "lz4")
    - maxObjectSize (e.g. "100 KB", "1 MB")
    - payloadSchema (An array of fields, e.g. [{id: "1", name: "id", type: "string", required: true}])
    `
  );

  const humanMessage = new HumanMessage(`Description: ${description}`);

  const response = await llm.invoke([prompt, humanMessage]);
  
  try {
    const cleaned = response.content.toString().replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    
    // Ensure payloadSchema has proper structure
    if (parsed.payloadSchema && Array.isArray(parsed.payloadSchema)) {
       parsed.payloadSchema = {
         id: `schema-${Date.now()}`,
         fields: parsed.payloadSchema.map((f: any, i: number) => ({
           id: f.id || `field-${i}`,
           name: f.name || "field",
           type: f.type || "string",
           required: f.required !== undefined ? f.required : false
         }))
       };
    }
    
    return parsed;
  } catch (error) {
    console.error("Failed to parse LLM JSON:", error);
    throw new Error("Failed to generate cache configuration.");
  }
}
