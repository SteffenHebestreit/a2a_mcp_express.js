# Agent-to-Agent (A2A) Docker Demo

This repository demonstrates agent-to-agent (A2A) communication using the Model Context Protocol (MCP) in a dockerized environment. It's based on the [a2a_mcp_express.js](https://github.com/SteffenHebestreit/a2a_mcp_express.js) repository.

## Overview

This demonstration runs two agents (agent1 and agent2), each with their own tools, enabling them to communicate and delegate tasks using the A2A protocol. The agents are using a local OpenAI-compatible LLM provider.

## Key Components

- **Two Agent Services**: agent1 and agent2 with their own configurations
- **Traefik**: Reverse proxy for proper hostname routing
- **Redis**: For agent memory/conversation storage
- **MCP Mock Server**: Provides calculator and weather tools via the Model Context Protocol

## Docker Setup

The project uses Docker Compose to orchestrate all services:

```bash
docker-compose up -d
```

## Implemented Features

1. **Agent-to-Agent Communication**: agent1 can delegate tasks to agent2
2. **MCP Tool Integration**: agent2 can use calculator tools via MCP
3. **Local LLM Support**: Both agents can use OpenAI-compatible local LLM providers

## Configuration Files

- **docker-compose.yml**: Defines all service containers and networking
- **agent1-config.yml** & **agent2-config.yml**: Agent-specific configuration
- **.env.agent1** & **.env.agent2**: Environment variables for API keys and endpoints

## Technical Changes

1. **Enhanced MCP Mock Server**:
   - Added proper JSON-RPC endpoint handling for the Model Context Protocol
   - Implemented the calculator tool with proper error handling
   - Used 'tools/call' as the method name according to the MCP specification
   - Added validation for required parameters (e.g., 'expression' for calculator)

2. **Custom Agent Handling**:
   - Implemented robust tool detection and execution logic
   - Fixed agent-to-agent communication with proper URL handling
   - Added better error handling and reporting

3. **LLM Integration**:
   - Configured both agents to use a local OpenAI-compatible LLM provider
   - Enhanced system prompts to ensure correct tool call format

## Recent Updates

- **Fixed MCP Tool Integration**:
  - Corrected the JSON-RPC method name in the MCP mock server to properly handle 'tools/call' as per the specification
  - Ensured the response format includes a content array for tool results, following the MCP schema requirements
  - Added better error handling for missing parameters in calculator tool requests
  
- **End-to-End Testing**:
  - Verified agent1 can successfully delegate tasks to agent2
  - Confirmed agent2 can use the MCP calculator tool with proper parameter handling
  - Fixed all issues in the communication chain for a seamless user experience

## Usage Examples

### Agent1 to Agent2 Communication

Send a request to agent1 asking it to delegate a calculation to agent2:

```bash
curl -X POST http://agent1.localhost/api/invoke \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Ask agent2 to calculate 12345 * 67890", "conversationId": "a2a-test"}'
```

## Debug and Development

You can view the logs for all containers:

```bash
docker-compose logs -f
```

## Testing the Agent Chain

To test the complete agent-to-agent + MCP tool chain:

1. Start all containers:
   ```bash
   docker-compose up -d
   ```

2. Send a request to agent1 to delegate a calculation to agent2:
   ```bash
   curl -X POST http://agent1.localhost/api/invoke \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Ask agent2 to calculate 12345 * 67890", "conversationId": "a2a-test"}'
   ```

3. Observe the logs to see the flow:
   ```bash
   docker-compose logs -f
   ```

Expected flow:
1. agent1 receives the request and identifies it needs agent2's help
2. agent1 uses the ask_another_a2a_agent tool to delegate to agent2
3. agent2 receives the task and identifies it needs to use the calculator
4. agent2 calls the MCP calculator tool with the expression
5. The MCP mock server processes the calculation and returns the result
6. agent2 returns the result to agent1
7. agent1 presents the final answer to the user

If there are errors at any step, the logs will help identify where the issue occurs.

### Example Log Output

When the calculator tool is called without the required 'expression' parameter:

```
agent2    | [INFO] Calling MCP tool 'mcp_calculator'
agent2    | [DEBUG] Tool args: {}
mcp-mock  | Received JSON-RPC method call: tools/call { name: 'mcp_calculator', arguments: {} }
mcp-mock  | Tool call: mcp_calculator {}
agent2    | [ERROR] Error calling MCP tool 'mcp_calculator': McpError: MCP error -32602: Missing required parameter 'expression' for calculator tool
```

When the calculator tool is called correctly with an expression parameter:

```
agent2    | [INFO] Calling MCP tool 'mcp_calculator'
agent2    | [DEBUG] Tool args: { expression: '123 * 456' }
mcp-mock  | Received JSON-RPC method call: tools/call { name: 'mcp_calculator', arguments: { expression: '123 * 456' } }
mcp-mock  | Tool call: mcp_calculator { expression: '123 * 456' }
agent2    | [INFO] MCP tool 'mcp_calculator' returned successfully
agent2    | [DEBUG] Tool result: { content: [ { type: 'text', text: '56088' } ] }
```

## Troubleshooting

### Common Issues

1. **Missing expression parameter in calculator tool**:
   
   The MCP calculator tool requires an 'expression' parameter, but sometimes the LLM might not provide it. This results in an error like:
   
   ```
   MCP error -32602: Missing required parameter 'expression' for calculator tool
   ```
   
   **Solution**: Ensure agent2's system prompt clearly indicates that the mcp_calculator tool requires an expression parameter. You can adjust the prompt in agent2-config.yml:
   
   ```yaml
   - 'mcp_calculator': Use it for calculations. It requires 'expression' parameter with a mathematical expression as a string.
   ```

2. **Agent-to-agent communication failures**:
   
   If the A2A communication fails, check:
   - Network connectivity between containers
   - Traefik routing configuration
   - Agent URLs in the configuration files
   
   The most common issue is incorrect URLs in the knownAgents section.

## Credits

Based on the [a2a_mcp_express.js](https://github.com/SteffenHebestreit/a2a_mcp_express.js) repository.
