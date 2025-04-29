import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// Input schema for the A2A tool
const askAnotherAgentSchema = z.object({
    targetAgentId: z
        .string()
        .describe("Base URL of the target agent (e.g., 'http://other-agent:5000')"),
    taskInput: z
        .union([z.string(), z.record(z.any())])
        .describe("Question or data for the target agent")
});

// Types for A2A protocol
type A2ATaskInput = z.infer<typeof askAnotherAgentSchema>;

interface A2ATaskMessage {
    role: string;
    parts: Array<{
        type: string;
        content: any;
    }>;
}

interface A2ATaskResponse {
    id: string;
    status: {
        state: string;
        message?: A2ATaskMessage;
    };
    artifacts?: Array<{
        type: string;
        [key: string]: any;
    }>;
}

export function AskAnotherAgentTool() {
    class A2ATool extends StructuredTool {
        name = "ask_another_a2a_agent";
        description = `Sends a task request to another A2A-compliant agent. Provide 'targetAgentId' (base URL) and 'taskInput'.`;
        schema = askAnotherAgentSchema;
        async _call(args: any): Promise<string> {
            // Validate input against schema
            const parse = askAnotherAgentSchema.safeParse(args);
            if (!parse.success) {
                return `Error: Invalid arguments for A2A tool. Expected { targetAgentId, taskInput }`;
            }
            const { targetAgentId, taskInput } = parse.data;
            console.log(`A2A Client Tool invoked with:`, JSON.stringify(args));
            try { new URL(targetAgentId); } catch (e: any) {
                return `Error: Invalid target agent URL format. ${e.message}`;
            }
            let messagingEndpoint: string;
            try {
                const response = await axios.get(`${targetAgentId}/.well-known/agent.json`, { timeout: 5000 });
                const card = response.data;
                const sendPath = card.taskEndpoints?.send || '/a2a/message';
                messagingEndpoint = new URL(sendPath, card.url || targetAgentId).toString();
            } catch (e: any) {
                const msg = e.response ? `Status ${e.response.status}` : e.message;
                return `Error: Could not contact agent ${targetAgentId}. ${msg}`;
            }
            const taskId = uuidv4();
            const requestBody = { task: { id: taskId, message: { role: 'user', parts: [
                typeof taskInput === 'string' ? { type: 'text', content: taskInput } : { type: 'data', content: taskInput }
            ] } } };
            try {
                const resp = await axios.post(messagingEndpoint, requestBody, { headers:{ 'Content-Type':'application/json' }, timeout:15000 });
                const responseTask = resp.data as A2ATaskResponse;
                let result = `Response from ${targetAgentId} (${responseTask.status.state}): `;
                if (responseTask.status.message?.parts?.length) {
                    const text = responseTask.status.message.parts.find(p=>p.type==='text')?.content
                        ?? JSON.stringify(responseTask.status.message.parts[0].content);
                    result += text;
                } else if (responseTask.artifacts?.length) {
                    result += `Artifacts: ${responseTask.artifacts.length}`;
                }
                return result;
            } catch (e: any) {
                const msg = e.response ? JSON.stringify(e.response.data) : e.message;
                return `Error communicating with agent ${targetAgentId}. ${msg}`;
            }
        }
    }
    return new A2ATool();
}
