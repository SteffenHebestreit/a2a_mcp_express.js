# A Simple Guide to the MCP & A2A Agent

## Additional Documentation

- **[README.md](./README.md)** - Technical documentation with setup instructions and configuration details
- **[CODE_STRUCTURE.md](./CODE_STRUCTURE.md)** - Detailed explanation of each source file and its purpose

## What Is This Software?

This software is an AI assistant (or "agent") that can:

1. Talk to users through simple API calls
2. Use external tools through a system called MCP
3. Talk to other AI assistants through a system called A2A
4. Remember conversations with users

Think of it like a smart assistant that can both answer questions directly AND use special tools to get more information when needed.

## Core Concepts Simplified

### The Agent

The "agent" is the brain of the system. It's built using:

- **LangChain**: A framework that helps organize how the AI thinks and makes decisions
- **Express**: A web server that handles incoming and outgoing messages
- **Large Language Model (LLM)**: The AI model that understands and generates text (like GPT-4, Claude, or local models)

### MCP (Model Context Protocol)

MCP is like a universal adapter for tools. It lets the AI agent use different tools without needing to know all the technical details of each one.

**Example**: If the agent needs to calculate something, it can use a calculator tool through MCP without knowing how the calculator works internally.

### A2A (Agent-to-Agent)

A2A allows AI assistants to talk to each other. It's like how people might ask colleagues for help with specialized questions.

**Example**: Your general-purpose AI assistant might ask a specialized financial AI assistant about stock market trends.

## How It Works (Step by Step)

1. **User sends a question** through the `/api/invoke` endpoint
2. **The agent receives the question** and thinks about how to answer it
3. **The agent decides if it needs tools** to answer properly
   - If yes, it uses MCP to access those tools
   - If it needs another agent's expertise, it uses A2A to communicate
4. **The agent formulates a response** based on its knowledge and any tool results
5. **The user receives the answer**

Throughout this process, the system keeps track of the conversation history so it can refer back to previous messages.

## Real-World Use Cases

### Use Case 1: Weather-Aware Travel Planning

**User**: "I'm traveling to Seattle next week. What should I pack?"

**What happens behind the scenes**:
1. The agent recognizes it needs weather information
2. It calls the weather tool through MCP to get Seattle's forecast
3. Based on the weather data, it suggests appropriate clothing and items to pack

### Use Case 2: Complex Calculations

**User**: "If I invest $1000 monthly at 7% annual return, how much will I have in 20 years?"

**What happens behind the scenes**:
1. The agent recognizes this is a compound interest problem
2. It uses a calculator tool through MCP to perform the complex math
3. It returns the calculated result along with an explanation

### Use Case 3: Specialized Knowledge

**User**: "What new tax incentives exist for electric vehicles this year?"

**What happens behind the scenes**:
1. The agent recognizes this is a specialized tax question
2. It uses A2A to ask a tax-specialized agent for current information
3. It receives the answer from the specialized agent and relays it to the user

## Technical Components Made Simple

### The Server (server.ts)
The "receptionist" of the system. It receives requests, routes them to the right place, and sends back responses.

### The Brain (agent/*)
Handles the thinking process. It looks at user questions, decides what tools to use, and formulates responses.

### The Toolbox (mcp/*)
Connects to external tools using the Model Context Protocol. It discovers what tools are available and helps the agent use them.

### The Network (tools/AskAnotherAgentTool.ts)
Allows the agent to talk to other specialized agents when it needs help answering a question.

### The Memory (agent/memory.ts)
Keeps track of conversations so the agent can remember previous messages from the same user.

### The Configuration (config/loader.ts)
Controls how the entire system works through a flexible YAML-based configuration system. This allows customizing every aspect of the agent without changing code.

## How to Think About This System

Imagine an office with:
- A receptionist (server) who takes calls and directs them
- A researcher (agent) who answers questions
- A toolbox (MCP) with various specialized tools
- A phone book (A2A) to call expert consultants
- A notebook (memory) to remember previous conversations
- An instruction manual (configuration) that tells everyone how to do their job

Together, these components create an AI assistant that can handle a wide range of questions by using its own knowledge, accessing tools, or consulting with other specialized assistants.

## Customization Possibilities

This system is flexible and can be customized by:
- Adding new tools through the MCP connection
- Connecting to different specialized agents via A2A
- Changing the underlying AI model (OpenAI, Claude, local models like Llama, etc.)
- Adjusting how the agent thinks and makes decisions
- Modifying the `agent-config.yml` file to change any aspect of the system without touching code

This makes it suitable for many different applications, from customer service to specialized business tools.