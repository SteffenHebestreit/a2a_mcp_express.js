import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { AgentCard, A2ATaskSendRequest, A2ATask, A2APart } from '../types/a2aTypes';
import { processWithAgent } from '../server';
import { clearMemoryForConversation } from '../agent/memory';
import { getRequestId } from '../utils/requestLogger';

const router = Router();

// --- A2A Compliance: Agent Card Endpoint ---
router.get('/.well-known/agent.json', (req: Request, res: Response) => {
    // Compliance: Serve the Agent Card according to A2A spec
    // Use server and A2A configuration from the unified config
    const agentCard: AgentCard = {
        name: config.server.name,
        description: config.server.description,
        url: config.server.baseUrl,
        version: config.a2a.version,
        capabilities: { // Specify agent features
            streaming: false, // Set to true if tasks/sendSubscribe implemented
            pushNotifications: false, // Set to true if webhooks implemented
            stateTransitionHistory: false // Set to true if task history provided
        },
        // Use skills from the configuration
        skills: config.a2a.skills,
        taskEndpoints: { // Explicitly define where to send tasks
            send: "/a2a/message" // Relative path for tasks/send
        }
    };
    res.json(agentCard);
});

// --- A2A Compliance: Messaging Endpoint (implements tasks/send) ---
router.post('/a2a/message', async (req: Request, res: Response) => {
    console.log("Received A2A /a2a/message POST request");
    const requestBody = req.body as A2ATaskSendRequest;
    const requestId = getRequestId(req);

    // Basic validation of incoming tasks/send structure
    if (!requestBody?.task?.id || !requestBody.task.message?.parts?.length) {
        console.error("Invalid A2A tasks/send request format:", requestBody);
        // Compliance: Return a structured A2A error Task
        const errorResponse: A2ATask = {
            id: requestBody?.task?.id || uuidv4(), // Echo ID if possible, else generate
            status: {
                state: "failed",
                message: { role:"assistant", parts: [{ type:"text", content: "Invalid tasks/send request format."}] }
            }
        };
        return res.status(400).json(errorResponse);
    }

    const taskId = requestBody.task.id;
    const incomingMessage = requestBody.task.message;
    console.log(`Processing incoming A2A Task ID: ${taskId}`);

    try {
        // Extract primary input
        // TODO: Implement more robust handling based on skills, content types, etc.
        const textPart = incomingMessage.parts.find((p: A2APart) => p.type === 'text');
        const dataPart = incomingMessage.parts.find((p: A2APart) => p.type === 'data'); // Or skill-specific type

        let agentInput = "";
        if (textPart) {
            agentInput = String(textPart.content); // Ensure it's a string
        } else if (dataPart) {
            // Simple stringification for now, might need skill-specific handling
            agentInput = JSON.stringify(dataPart.content);
        } else {
             throw new Error("No suitable 'text' or 'data' part found in incoming A2A message.");
        }

        // --- Determine Action (Simple dispatch vs Skill mapping) ---
        // TODO: Implement proper skill dispatch based on Agent Card 'skills'
        // For now, route everything to the general LangChain agent
        console.log(`Invoking local LangChain agent for A2A task ${taskId} with input: ${agentInput}`);

        // Use a temporary conversation ID based on the task ID for context isolation
        const tempConvId = `a2a-task-${taskId}`;
        const processingResult = await processWithAgent(agentInput, tempConvId, requestId);

        // Clean up temporary memory after processing
        await clearMemoryForConversation(tempConvId);

        // Compliance: Construct A2A Task response object
        let responseTask: A2ATask;
        if ('error' in processingResult) {
             responseTask = {
                 id: taskId,
                 status: {
                     state: "failed",
                     message: { role: "assistant", parts: [{ type: "text", content: `Task processing failed: ${processingResult.error}` }] }
                 }
             };
        } else {
             responseTask = {
                 id: taskId,
                 status: {
                     state: "completed",
                     message: { // Include agent's reply in the status message
                         role: "assistant",
                         parts: [
                             { type: "text", content: processingResult.reply }
                             // Could add data parts or artifacts here if agent generated structured output
                         ]
                     }
                 },
                 // artifacts: [] // Add artifacts if generated
             };
        }

        console.log(`Sending A2A Task response for ID ${taskId}:`, JSON.stringify(responseTask, null, 2));
        res.status(200).json(responseTask);

    } catch (error: any) {
        console.error(`Error processing A2A Task ${taskId}:`, error);
        // Compliance: Return A2A Task response indicating failure
        const errorResponseTask: A2ATask = {
            id: taskId,
            status: {
                state: "failed",
                message: { role: "assistant", parts: [{ type: "text", content: `Internal Server Error: ${error.message}` }] }
            }
        };
        res.status(500).json(errorResponseTask);
    }
});

export default router;
