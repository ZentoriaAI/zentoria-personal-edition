/**
 * AI Orchestrator HTTP Client
 *
 * Communicates with AI Orchestrator Service (Container 444)
 */
export class AiOrchestratorClient {
    baseUrl;
    logger;
    constructor({ logger }) {
        this.baseUrl = process.env.AI_ORCHESTRATOR_URL || "http://192.168.220.245:8000";
        this.logger = logger;
    }
    /**
     * Process an AI command
     */
    async processCommand(payload) {
        this.logger.debug({ commandId: payload.id }, "Sending command to AI Orchestrator");

        // Transform payload to AI Orchestrator format
        const aiPayload = {
            command: payload.command,
            agent: "chat",
            context: {
                user_id: payload.userId,
                session_id: payload.sessionId,
                model: payload.model || "llama3.2:3b",
                temperature: payload.temperature || 0.7,
                max_tokens: payload.maxTokens || 2048
            }
        };

        const response = await fetch(`${this.baseUrl}/api/v1/command`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Service-Auth": process.env.SERVICE_AUTH_TOKEN || "",
            },
            body: JSON.stringify(aiPayload),
        });
        if (!response.ok) {
            const error = await response.text();
            this.logger.error({ status: response.status, error }, "AI Orchestrator request failed");
            throw new Error(`AI Orchestrator error: ${response.status} - ${error}`);
        }

        const result = await response.json();

        // Transform response to expected format
        return {
            content: result.result || result.content || "",
            model: result.metadata?.model || payload.model || "llama3.2:3b",
            usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0
            },
            finishReason: "stop",
            metadata: result.metadata
        };
    }
    /**
     * Process command with streaming
     */
    async *processCommandStream(payload) {
        const aiPayload = {
            command: payload.command,
            agent: "chat",
            context: {
                user_id: payload.userId,
                session_id: payload.sessionId,
                model: payload.model || "llama3.2:3b"
            }
        };

        const response = await fetch(`${this.baseUrl}/api/v1/chat/stream`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Service-Auth": process.env.SERVICE_AUTH_TOKEN || "",
                "Accept": "text/event-stream",
            },
            body: JSON.stringify(aiPayload),
        });
        if (!response.ok) {
            const error = await response.text();
            yield { type: "error", content: error };
            return;
        }
        const reader = response.body?.getReader();
        if (!reader) {
            yield { type: "error", content: "No response body" };
            return;
        }
        const decoder = new TextDecoder();
        let buffer = "";
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6);
                        if (data === "[DONE]") {
                            yield { type: "done" };
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            yield { type: "chunk", content: parsed.content, usage: parsed.usage };
                        }
                        catch {
                        }
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
    }
    /**
     * Get available models
     */
    async getModels() {
        const response = await fetch(`${this.baseUrl}/api/v1/models`, {
            method: "GET",
            headers: {
                "X-Service-Auth": process.env.SERVICE_AUTH_TOKEN || "",
            },
        });
        if (!response.ok) {
            return ["llama3.2:3b", "codellama:7b"];
        }
        const data = await response.json();
        return data.models;
    }
    /**
     * Check service health
     */
    async health() {
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/health`, {
                method: "GET",
                signal: AbortSignal.timeout(5000),
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
}
