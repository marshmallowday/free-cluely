export interface Solution {
  initial_thoughts: string[]
  thought_steps: string[]
  description: string
  code: string
}

export interface SolutionsResponse {
  [key: string]: Solution
}

export interface Parameter {
  name: string
  type: string
  description?: string
}

export interface TestCase {
  input: unknown
  output: unknown
  description?: string
}

export interface ProblemStatementData {
  problem_statement: string;
  input_format: {
    description: string;
    parameters: Parameter[];
  };
  output_format: {
    description: string;
    type: string;
    subtype: string;
  };
  complexity: {
    time: string;
    space: string;
  };
  test_cases: TestCase[];
  validation_type: string;
  difficulty: string;
}
