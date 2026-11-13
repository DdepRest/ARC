export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  toolName: string;
  message?: string;
  tasks?: any[];
  total?: number;
  [key: string]: any;
}

export interface ToolInstance {
  definition: ToolDefinition;
  execute(params: any): Promise<ToolResult>;
}
