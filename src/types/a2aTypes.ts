export interface A2APart {
  type: string;
  content: any;
}

export interface A2AMessage {
  role: string;
  parts: A2APart[];
}

export interface A2ATaskSendRequest {
  task: {
    id: string;
    message: A2AMessage;
  };
}

export interface A2ATask {
  id: string;
  status: {
    state: string;
    message: A2AMessage;
  };
  artifacts?: Array<{
    type: string;
    [key: string]: any;
  }>;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  inputModes: string[];
  outputModes: string[];
}

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  skills: AgentSkill[];
  taskEndpoints: {
    send: string;
  };
}