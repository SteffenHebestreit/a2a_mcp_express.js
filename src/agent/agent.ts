import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { Tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { BufferMemory } from "langchain/memory";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { getMcpTools } from "../mcp/tools";
import { AskAnotherAgentTool } from "../tools/AskAnotherAgentTool";
import { config } from "../config";
import { getMemoryForConversation, clearMemoryForConversation } from "./memory";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import logger from "../utils/logger";

// Initialize LLM based on the configured provider
function initializeLLM(): BaseChatModel {
  switch (config.llm.provider.toLowerCase()) {
    case 'ollama':
      // For Ollama, we need to use ChatOpenAI since ChatOllama has compatibility issues
      // We'll set up a proxy via environment variables if needed
      logger.info('Using OpenAI-compatible interface for Ollama');
      return new ChatOpenAI({
        modelName: config.llm.model,
        temperature: config.llm.temperature,
        openAIApiKey: "ollama-key", // Dummy key for OpenAI format
        configuration: {
          baseURL: config.llm.ollama.baseUrl,
          defaultHeaders: {
            "Content-Type": "application/json",
          },
        },
      });
    
    case 'openai':
    default:
      logger.info(`Initializing OpenAI model: ${config.llm.model}`);
      return new ChatOpenAI({
        modelName: config.llm.model,
        temperature: config.llm.temperature,
        openAIApiKey: config.llm.openai.apiKey || "dummy-key",
        configuration: config.llm.openai.apiUrl ? {
          baseURL: config.llm.openai.apiUrl,
        } : undefined,
      });
  }
}

// Initialize the LLM
const llm = initializeLLM();

interface AgentResult {
  reply: string;
  conversationId: string;
  status: string;
}
interface AgentError {
  error: string;
  conversationId: string;
}

// Check if a prompt is a continuation command
function isContinuationCommand(prompt: string): boolean {
  return /^@agent\s+Continue:/i.test(prompt);
}

// Extract the actual continuation prompt from the command
function extractContinuationPrompt(prompt: string): string {
  const match = prompt.match(/^@agent\s+Continue:\s*"(.+?)"$/);
  if (match && match[1]) {
    return match[1];
  }
  
  // If no quoted text is found, extract everything after the colon
  const colonIndex = prompt.indexOf(':');
  if (colonIndex !== -1) {
    return prompt.substring(colonIndex + 1).trim();
  }
  
  return "Continue with the previous task";
}

// New function to check if the output is a tool call JSON
function isToolCallJSON(output: string): boolean {
  try {
    const parsed = JSON.parse(output);
    // Check for different possible formats
    const isToolCall = (
      (parsed.tool && typeof parsed.tool === 'string') || 
      (parsed.action && typeof parsed.action === 'string')
    );
    logger.debug(`isToolCallJSON check: ${isToolCall ? 'true' : 'false'}, output: ${output}`);
    return isToolCall;
  } catch (e) {
    logger.error(`Error parsing JSON in isToolCallJSON: ${e}`);
    return false;
  }
}

// New function to execute a tool based on the JSON output
async function executeToolFromJSON(jsonOutput: string, tools: any[]): Promise<string> {
  try {
    const parsed = JSON.parse(jsonOutput);
    logger.debug(`Parsed JSON for tool execution:`, parsed);
    
    // Extract tool name from various possible formats
    let toolName = parsed.tool || parsed.action;
    if (!toolName) {
      logger.error(`No tool name found in JSON: ${jsonOutput}`);
      return "Error: No tool name found in the response.";
    }
    
    // Find the matching tool
    const tool = tools.find(t => t.name === toolName);
    if (!tool) {
      logger.error(`Tool '${toolName}' not found. Available tools: ${tools.map(t => t.name).join(', ')}`);
      return `Error: Tool '${toolName}' not found`;
    }
      // For ask_another_a2a_agent tool, ensure it's calling agent2, not itself
    if (toolName === 'ask_another_a2a_agent') {
      // Fix the targetAgentId if it's pointing to agent1 instead of agent2
      if (parsed.targetAgentId === 'http://agent1.localhost') {
        logger.warn(`Agent tried to call itself. Redirecting to agent2.`);
        parsed.targetAgentId = 'http://agent2.localhost';
      }
      
      // The tool expects targetAgentId and taskInput as properties
      const toolInput = {
        targetAgentId: parsed.targetAgentId,
        taskInput: parsed.taskInput
      };
      
      // Log the extracted parameters
      logger.debug(`ask_another_a2a_agent parameters:`, toolInput);
      
      // Validate required parameters
      if (!toolInput.targetAgentId || !toolInput.taskInput) {
        logger.error(`Missing required parameters for ask_another_a2a_agent:`, toolInput);
        return "Error: Missing required parameters for ask_another_a2a_agent (targetAgentId, taskInput)";
      }
      
      logger.info(`Executing tool '${toolName}' with input:`, toolInput);
        try {
        // For A2A tool, bypass the _call method and use direct HTTP request
        const taskId = uuidv4();
        const requestBody = { 
          task: { 
            id: taskId, 
            message: { 
              role: 'user', 
              parts: [
                { type: 'text', content: toolInput.taskInput }
              ] 
            } 
          } 
        };
          // Use the original target URL
        logger.debug(`Sending A2A request to ${toolInput.targetAgentId} with task: ${toolInput.taskInput}`);
        
        const resp = await axios.post(`${toolInput.targetAgentId}/a2a/message`, requestBody, { 
          headers: { 'Content-Type': 'application/json' }, 
          timeout: 15000 
        });
        
        const responseTask = resp.data;
        logger.debug(`Received A2A response:`, responseTask);
        
        let result = `Response from ${toolInput.targetAgentId} (${responseTask.status.state}): `;
        if (responseTask.status.message?.parts?.length) {
          const text = responseTask.status.message.parts.find((p: any) => p.type === 'text')?.content
            ?? JSON.stringify(responseTask.status.message.parts[0].content);
          result += text;
        } else if (responseTask.artifacts?.length) {
          result += `Artifacts: ${responseTask.artifacts.length}`;
        }
        
        return result;
      } catch (e: any) {
        const msg = e.response ? JSON.stringify(e.response.data) : e.message;
        logger.error(`Error in A2A communication:`, e);
        return `Error communicating with agent ${toolInput.targetAgentId}. ${msg}`;
      }
    } else {
      // For other tools, use the standard parameter extraction
      const toolInput = parsed.tool_input || parsed.action_input || {};
      
      logger.info(`Executing tool '${toolName}' with input:`, toolInput);
      
      // Execute the tool
      const result = await tool.invoke(toolInput);
      logger.info(`Tool execution result:`, result);
      
      return result;
    }
  } catch (e: any) {
    logger.error(`Error executing tool:`, e.message, e.stack);
    return `Error executing tool: ${e.message}`;
  }
}

export async function processWithAgent(userPrompt: string, conversationId: string): Promise<AgentResult | AgentError> {
  logger.info(`Processing prompt for conversation ${conversationId}`);
  logger.debug(`Prompt content: "${userPrompt}"`);

  // Handle continuation command
  let processedPrompt = userPrompt;
  if (isContinuationCommand(userPrompt)) {
    const continuationPrompt = extractContinuationPrompt(userPrompt);
    logger.info(`Detected continuation command for conversation ${conversationId}`);
    
    // Modify the prompt to indicate continuation
    processedPrompt = `${continuationPrompt} (This is a continuation of our previous conversation. Please maintain the context of what we were discussing and continue from where we left off.)`;
  }

  // Load tools dynamically
  logger.debug(`Loading tools for conversation ${conversationId}...`);
  const mcpTools = await getMcpTools();
  const a2aTool = AskAnotherAgentTool();
  const tools = [...mcpTools, a2aTool];
  logger.debug(`Loaded ${tools.length} tools (${mcpTools.length} MCP tools, 1 A2A tool)`);

  // Create prompt
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", config.agent.systemPrompt],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  try {
    // Initialize agent
    logger.debug(`Creating agent for conversation ${conversationId}`);
    const agent = await createOpenAIFunctionsAgent({ llm, tools, prompt });
    const memory = await getMemoryForConversation(conversationId);
    const executor = new AgentExecutor({ 
      agent, 
      tools, 
      memory, 
      verbose: config.agent.verbose, 
      handleParsingErrors: config.agent.handleParsingErrors 
    });

    logger.info(`Executing agent for conversation ${conversationId}`);
    const result = await executor.invoke({ input: processedPrompt });
    logger.debug(`Agent execution result:`, result);

    if (typeof result.output !== 'string') {
      logger.error(`Agent produced invalid output format for ${conversationId}`);
      return { error: "Agent produced invalid output format.", conversationId };
    }
    
    // Check if the output is a tool call JSON
    if (isToolCallJSON(result.output)) {
      logger.info(`Detected tool call JSON in output for ${conversationId}`);
      
      // Execute the tool based on the JSON
      const toolResult = await executeToolFromJSON(result.output, tools);
      
      // Update the result
      logger.info(`Updated output with tool result for ${conversationId}`);
      return { reply: toolResult, conversationId, status: "complete" };
    }
    
    logger.info(`Agent execution completed successfully for ${conversationId}`);
    return { reply: result.output, conversationId, status: "complete" };
  } catch (error: any) {
    logger.error(`Error during agent execution for ${conversationId}:`, error.message);
    return { error: `Agent execution error: ${error.message}`, conversationId };
  }
}
